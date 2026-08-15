import React, { useState, useRef } from 'react';
import { useDb } from '../context/DbContext';
import { extractGuardianPhone, normalizePhone, participantKey } from '../lib/participantIdentity';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  HelpCircle,
  Download,
  FileSpreadsheet
} from 'lucide-react';

// Balaks rarely have their own phone, so the guardian column carries the
// contact number and is the required one. A sheet may still supply a separate
// participant number; if mapped it wins, otherwise the number is read out of
// the guardian text.
const REQUIRED_FIELDS = {
  name: { label: 'Participant Name', required: true, synonyms: ['name', 'full name', 'balak name', 'candidate'] },
  guardianDetails: { label: 'Guardian Name & Contact', required: true, synonyms: ['guardian', 'parent', 'guardian contact details', 'father', 'mother'] },
  sabha: { label: 'Mandal / Sabha', required: false, synonyms: ['sabha', 'mandal', 'mandal-sabha', 'class', 'group'] },
  karyakar: { label: 'Karyakar Name', required: false, synonyms: ['karyakar', 'teacher', 'karyakar name', 'mentor'] },
  phone: { label: 'Participant Phone (optional)', required: false, synonyms: ['phone', 'mobile', 'cell', 'phone number'] }
};

// Canonical roster template (decision D2, revised: the balak's own phone is no
// longer collected). The importer still allows column mapping, so a real
// sheet's headers need not match these exactly.
const SAMPLE_HEADERS = ['Name', 'Mandal-Sabha', 'Karyakar Name', 'Guardian Contact Details'];

export default function ExcelImport() {
  const { importExcelData, participants, sabhas, karyakars, addLookupEntries } = useDb();

  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]); // Array of arrays from row 1 onwards
  const [mappings, setMappings] = useState({});
  const [previewRows, setPreviewRows] = useState([]);
  const [previewStats, setPreviewStats] = useState(null);
  const [lookupIssues, setLookupIssues] = useState(null);
  const [lookupsCreated, setLookupsCreated] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef(null);

  // Build a sample roster from the sabhas/karyakars actually configured here, so the
  // file doubles as a reference for which values this system will recognise.
  const handleDownloadSample = () => {
    const sampleRow = (n, sabha, karyakarName) => ({
      'Name': `Sample Balak ${n}`,
      'Mandal-Sabha': sabha,
      'Karyakar Name': karyakarName,
      'Guardian Contact Details': `Guardian ${n} (Father) - 91000000${String(n).padStart(2, '0')}`
    });

    const rows = karyakars.map((k, i) => sampleRow(i + 1, k.sabha, k.name));

    // Sabhas with no karyakar still get a row, showing the karyakar column is optional.
    sabhas
      .filter(s => !karyakars.some(k => k.sabha === s))
      .forEach((s, i) => rows.push(sampleRow(karyakars.length + i + 1, s, '')));

    if (rows.length === 0) {
      rows.push(sampleRow(1, 'Bal Sabha - Sub-group A1', 'Karyakar Name'));
    }

    // Siblings share one guardian number — shown explicitly so it's clear that
    // is expected and both rows still import.
    const first = rows[0];
    rows.push({
      ...first,
      'Name': `${first['Name']} (sibling)`
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header: SAMPLE_HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Roster');
    XLSX.writeFile(wb, 'sample_roster.csv', { bookType: 'csv' });
  };

  // Create the sabhas/karyakars this file referenced but that aren't configured yet.
  const handleCreateLookups = () => {
    if (!lookupIssues) return;
    const result = addLookupEntries({
      sabhas: lookupIssues.unknownSabhas,
      karyakars: lookupIssues.unknownKaryakars
    });
    if (result.error) {
      setErrorMsg(result.error);
      return;
    }
    setLookupsCreated(result);
    setLookupIssues({ ...lookupIssues, unknownSabhas: [], unknownKaryakars: [] });
  };

  // File Upload Handler
  const handleFileChange = (e) => {
    setErrorMsg('');
    setImportSummary(null);
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    if (!uploadedFile.name.endsWith('.xlsx') && !uploadedFile.name.endsWith('.xls') && !uploadedFile.name.endsWith('.csv')) {
      setErrorMsg('Invalid file format. Please upload an Excel sheet (.xlsx, .xls) or CSV.');
      return;
    }

    setFile(uploadedFile);
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Parse sheet as raw matrix [ [col1, col2], [val1, val2] ].
        // raw: false keeps cells as formatted text — without it a phone like
        // 0987654321 is read as a number and loses its leading zero, corrupting
        // the unique participant key (decision D3).
        const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
        
        if (matrix.length === 0) {
          setErrorMsg('The uploaded sheet is empty.');
          return;
        }

        const sheetHeaders = matrix[0].map(h => String(h).trim());
        const sheetRows = matrix.slice(1);

        setHeaders(sheetHeaders);
        setRawRows(sheetRows);
        
        // Auto-match headers to fields based on synonyms
        const initialMappings = {};
        Object.entries(REQUIRED_FIELDS).forEach(([fieldKey, config]) => {
          const matchedHeaderIdx = sheetHeaders.findIndex(header => 
            config.synonyms.some(syn => header.toLowerCase().includes(syn.toLowerCase()))
          );
          if (matchedHeaderIdx > -1) {
            initialMappings[fieldKey] = matchedHeaderIdx;
          } else {
            initialMappings[fieldKey] = -1; // Unmapped
          }
        });
        
        setMappings(initialMappings);
        generatePreview(sheetRows, initialMappings);
      } catch (err) {
        console.error(err);
        setErrorMsg('Error reading file. Make sure the file is not corrupted.');
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  // Analyze ALL rows so duplicates/ambiguities are identified before import (FR-1)
  const generatePreview = (rows, currentMappings) => {
    const seenPhones = new Set();
    const stats = { new: 0, update: 0, unchanged: 0, review: 0, duplicate: 0, rejected: 0 };

    // Lookup consistency, collected in the same pass
    const unknownSabhas = new Map();
    const unknownKaryakars = new Map();
    const mismatches = new Map();

    const analyzed = rows.map((row, rowIdx) => {
      const parsedRow = {};
      Object.entries(currentMappings).forEach(([fieldKey, colIdx]) => {
        if (colIdx !== undefined && colIdx > -1) {
          parsedRow[fieldKey] = row[colIdx] !== undefined ? String(row[colIdx]).trim() : '';
        } else {
          parsedRow[fieldKey] = '';
        }
      });

      // Resolve the contact number the same way importExcelData will
      const contactPhone = normalizePhone(parsedRow.phone) || extractGuardianPhone(parsedRow.guardianDetails);
      parsedRow.contactPhone = contactPhone;
      const rowKey = participantKey(parsedRow.name, contactPhone);

      // Determine what the importer will do with this row
      let status = 'new';
      let note = 'New participant';
      if (!parsedRow.name) {
        status = 'rejected';
        note = 'Missing name — row will be rejected';
      } else if (!contactPhone) {
        status = 'review';
        note = 'No contact number in the guardian details — will be created flagged for manual review';
      } else if (seenPhones.has(rowKey)) {
        status = 'duplicate';
        note = `Same name and guardian number already appear in this file (${contactPhone}) — row will be skipped`;
      } else {
        seenPhones.add(rowKey);
        const existing = participants.find(p => participantKey(p.name, p.phone) === rowKey && (p.status === 'approved' || p.status === 'pending'));
        if (existing) {
          const isSame = (parsedRow.name || existing.name) === existing.name &&
            (contactPhone || existing.phone) === existing.phone &&
            (parsedRow.sabha || existing.sabha) === existing.sabha &&
            (parsedRow.karyakar || existing.karyakar) === existing.karyakar &&
            (parsedRow.guardianDetails || existing.guardianDetails) === existing.guardianDetails;
          if (isSame) {
            status = 'unchanged';
            note = `Identical to existing record ${existing.id} — no change`;
          } else {
            status = 'update';
            note = `Will merge details into existing participant ${existing.id}`;
          }
        }
      }
      stats[status]++;

      // Sabha/karyakar lookup checks — skipped for rows the importer will drop
      const lookupWarnings = [];
      if (status !== 'rejected' && status !== 'duplicate') {
        const configuredKaryakar = parsedRow.karyakar
          ? karyakars.find(k => k.name === parsedRow.karyakar)
          : null;

        const sabhaKnown = parsedRow.sabha ? sabhas.includes(parsedRow.sabha) : true;

        if (parsedRow.sabha && !sabhaKnown) {
          unknownSabhas.set(parsedRow.sabha, true);
          lookupWarnings.push('Unknown sabha');
        }
        if (parsedRow.karyakar && !configuredKaryakar) {
          // Keyed by name: the row's sabha is the assignment we would create.
          if (!unknownKaryakars.has(parsedRow.karyakar)) {
            unknownKaryakars.set(parsedRow.karyakar, { name: parsedRow.karyakar, sabha: parsedRow.sabha });
          }
          lookupWarnings.push('Unknown karyakar');
        }
        // Only meaningful once the sabha itself is recognised — otherwise the
        // unknown-sabha warning above already covers this row.
        if (configuredKaryakar && parsedRow.sabha && sabhaKnown && configuredKaryakar.sabha !== parsedRow.sabha) {
          mismatches.set(parsedRow.karyakar, {
            name: parsedRow.karyakar,
            configuredSabha: configuredKaryakar.sabha,
            rowSabha: parsedRow.sabha
          });
          lookupWarnings.push('Karyakar mapped to a different sabha');
        }
      }

      return { id: rowIdx, data: parsedRow, status, note, lookupWarnings };
    });

    setPreviewStats(stats);
    setPreviewRows(analyzed.slice(0, 10));
    setLookupsCreated(null);
    setLookupIssues({
      unknownSabhas: [...unknownSabhas.keys()],
      unknownKaryakars: [...unknownKaryakars.values()],
      mismatches: [...mismatches.values()]
    });
  };

  // Handle mapping updates
  const handleMappingChange = (fieldKey, colIdx) => {
    const updated = { ...mappings, [fieldKey]: parseInt(colIdx) };
    setMappings(updated);
    generatePreview(rawRows, updated);
  };

  // Trigger spreadsheet ingestion
  const handleRunImport = () => {
    setErrorMsg('');
    
    // Ensure required fields are mapped
    const missingFields = Object.entries(REQUIRED_FIELDS)
      .filter(([key, config]) => config.required && (mappings[key] === undefined || mappings[key] === -1))
      .map(([_, config]) => config.label);

    if (missingFields.length > 0) {
      setErrorMsg(`Required mapping fields are missing: ${missingFields.join(', ')}`);
      return;
    }

    // Map all raw rows
    const dataToImport = rawRows.map(row => {
      const parsedRow = {};
      Object.entries(mappings).forEach(([fieldKey, colIdx]) => {
        if (colIdx !== undefined && colIdx > -1) {
          parsedRow[fieldKey] = row[colIdx] !== undefined ? String(row[colIdx]).trim() : '';
        } else {
          parsedRow[fieldKey] = '';
        }
      });
      return parsedRow;
    }).filter(row => row.name || row.guardianDetails); // Filter empty rows

    if (dataToImport.length === 0) {
      setErrorMsg('No valid rows found to import.');
      return;
    }

    const summary = importExcelData(dataToImport);
    if (summary.error) {
      setErrorMsg(summary.error);
      return;
    }
    setImportSummary(summary);
    
    // Reset state
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setMappings({});
    setPreviewRows([]);
    setPreviewStats(null);
    setLookupIssues(null);
    setLookupsCreated(null);
  };

  const handleReset = () => {
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setMappings({});
    setPreviewRows([]);
    setPreviewStats(null);
    setLookupIssues(null);
    setLookupsCreated(null);
    setImportSummary(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="container-padding animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Informational Guidelines Header */}
      <div className="card" style={{
        background: 'linear-gradient(to right, var(--bg-secondary), rgba(var(--accent-rgb), 0.02))'
      }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileSpreadsheet color="var(--accent)" size={22} />
          <span>Excel Data Synchronizer</span>
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
          Upload a master roster. The importer allows column-mapping so you don't need fixed spreadsheets headers. If a participant phone number is already registered in the registry, their information will be updated instead of duplicated.
        </p>

        {/* Column contract — driven off REQUIRED_FIELDS so it can never drift from the auto-mapper */}
        <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <HelpCircle size={16} color="var(--accent)" />
              <span>Expected columns</span>
            </h4>
            <button onClick={handleDownloadSample} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
              <Download size={14} />
              <span>Download sample CSV</span>
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '520px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '0.5rem 0.75rem 0.5rem 0' }}>Column</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Required</th>
                  <th style={{ padding: '0.5rem 0' }}>Headers recognised automatically</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(REQUIRED_FIELDS).map(([fieldKey, config]) => (
                  <tr key={fieldKey} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.6rem 0.75rem 0.6rem 0', fontWeight: 600 }}>{config.label}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <span className={`badge ${config.required ? 'badge-danger' : 'badge-info'}`}>
                        {config.required ? 'Required' : 'Optional'}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0', color: 'var(--text-secondary)' }}>{config.synonyms.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, lineHeight: '1.6' }}>
            The sample is generated from this system's configured sabhas and karyakars, so each row shows a valid Mandal-Sabha paired with the karyakar assigned to it. Names or headers that differ can still be mapped by hand after upload.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="badge badge-danger" style={{ padding: '0.85rem', borderRadius: 'var(--radius-sm)', display: 'block', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} />
            <strong>Error:</strong> {errorMsg}
          </div>
        </div>
      )}

      {importSummary && (
        <div className="badge badge-success" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)', display: 'block', width: '100%' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <CheckCircle2 size={20} />
            <span> Roster Sync Successful</span>
          </h4>
          <ul style={{ listStyle: 'none', paddingLeft: 0, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <li>➕ New Added: <strong>{importSummary.inserted}</strong></li>
            <li>🔄 Existing Merged: <strong>{importSummary.updated}</strong></li>
            <li>➖ Unchanged: <strong>{importSummary.unchanged}</strong></li>
            <li>👁️ Sent to Review (no contact no.): <strong>{importSummary.review}</strong></li>
            <li>📑 Duplicate Rows Skipped: <strong>{importSummary.duplicates}</strong></li>
            <li>⚠️ Rejected: <strong>{importSummary.rejected}</strong></li>
          </ul>
        </div>
      )}

      {/* File Upload Stage */}
      {!file && (
        <div 
          onClick={() => fileInputRef.current.click()}
          style={{
            border: '2px dashed var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '4rem 2rem',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: 'rgba(22, 30, 49, 0.2)',
            transition: 'var(--transition)'
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files[0];
            if (dropped) {
              const dt = new DataTransfer();
              dt.items.add(dropped);
              fileInputRef.current.files = dt.files;
              handleFileChange({ target: { files: dt.files } });
            }
          }}
          className="upload-dropzone"
        >
          <UploadCloud size={48} color="var(--accent)" style={{ marginBottom: '1rem' }} />
          <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Select spreadsheet to parse</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Drag & drop your Excel (.xlsx, .xls) or CSV file here, or click to browse</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".xlsx,.xls,.csv" 
            style={{ display: 'none' }} 
          />
        </div>
      )}

      {/* Mapping Configuration Stage */}
      {file && headers.length > 0 && (
        <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 600 }}>File: <span style={{ color: 'var(--accent)' }}>{file.name}</span></h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Map your spreadsheet headers to the system columns below.</p>
            </div>
            <button onClick={handleReset} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
              <RefreshCw size={14} />
              <span>Change File</span>
            </button>
          </div>

          {/* Mapping Grid selector */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            backgroundColor: 'var(--bg-primary)',
            padding: '1.25rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)'
          }}>
            {Object.entries(REQUIRED_FIELDS).map(([fieldKey, config]) => (
              <div key={fieldKey} className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', gap: '0.25rem' }}>
                  <span>{config.label}</span>
                  {config.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                </label>
                <select
                  className="form-control"
                  value={mappings[fieldKey] !== undefined ? mappings[fieldKey] : -1}
                  onChange={(e) => handleMappingChange(fieldKey, e.target.value)}
                  style={{
                    borderColor: mappings[fieldKey] === -1 && config.required ? 'var(--danger)' : 'var(--border-color)'
                  }}
                >
                  <option value={-1}>-- Unmapped --</option>
                  {headers.map((h, index) => (
                    <option key={index} value={index}>Column: {h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Whole-file analysis summary (duplicates/ambiguities identified before import) */}
          {previewStats && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge badge-success">New: {previewStats.new}</span>
              <span className="badge badge-info">Updates: {previewStats.update}</span>
              <span className="badge badge-info" style={{ opacity: 0.7 }}>Unchanged: {previewStats.unchanged}</span>
              <span className="badge badge-warning">To Review (no contact no.): {previewStats.review}</span>
              <span className="badge badge-warning">Duplicates in file: {previewStats.duplicate}</span>
              <span className="badge badge-danger">Rejected: {previewStats.rejected}</span>
            </div>
          )}

          {/* Sabha / karyakar values this file references but that aren't configured */}
          {lookupIssues && (lookupIssues.unknownSabhas.length > 0 || lookupIssues.unknownKaryakars.length > 0 || lookupIssues.mismatches.length > 0) && (
            <div style={{
              backgroundColor: 'var(--warning-light)',
              border: '1px solid var(--warning)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem'
            }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <AlertTriangle size={18} />
                <span>Unrecognised sabha / karyakar values</span>
              </h4>

              {lookupIssues.unknownSabhas.length > 0 && (
                <div style={{ fontSize: '0.85rem' }}>
                  <strong>{lookupIssues.unknownSabhas.length} sabha(s) not configured:</strong>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>{lookupIssues.unknownSabhas.join(', ')}</span>
                </div>
              )}

              {lookupIssues.unknownKaryakars.length > 0 && (
                <div style={{ fontSize: '0.85rem' }}>
                  <strong>{lookupIssues.unknownKaryakars.length} karyakar(s) not configured:</strong>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {lookupIssues.unknownKaryakars.map(k => `${k.name} → ${k.sabha || 'Unassigned'}`).join(', ')}
                  </span>
                </div>
              )}

              {lookupIssues.mismatches.length > 0 && (
                <div style={{ fontSize: '0.85rem' }}>
                  <strong>{lookupIssues.mismatches.length} karyakar(s) mapped to a different sabha here:</strong>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {lookupIssues.mismatches.map(m => `${m.name} (configured: ${m.configuredSabha}, file: ${m.rowSabha})`).join('; ')}
                  </span>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.35rem 0 0 0' }}>
                    The existing mapping is left untouched — rows import with the values in the file. Change the assignment in Admin Settings if the file is correct.
                  </p>
                </div>
              )}

              {(lookupIssues.unknownSabhas.length > 0 || lookupIssues.unknownKaryakars.length > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <button onClick={handleCreateLookups} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
                    <CheckCircle2 size={14} />
                    <span>Create missing entries</span>
                  </button>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    …or correct the spelling in your file and upload it again.
                  </span>
                </div>
              )}
            </div>
          )}

          {lookupsCreated && (
            <div className="badge badge-success" style={{ padding: '0.85rem', borderRadius: 'var(--radius-sm)', display: 'block', width: '100%', fontSize: '0.85rem' }}>
              <CheckCircle2 size={14} style={{ verticalAlign: 'text-bottom', marginRight: '0.4rem' }} />
              Added {lookupsCreated.addedSabhas.length} sabha(s) and {lookupsCreated.addedKaryakars.length} karyakar(s) to the lookup lists.
            </div>
          )}

          {/* Verification Preview Table */}
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span> Roster Import Preview (First 10 rows — all {rawRows.length} rows analyzed above)</span>
            </h4>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Guardian Contact No.</th>
                    <th>Mandal-Sabha</th>
                    <th>Karyakar</th>
                    <th>Guardian Details</th>
                    <th>Roster Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((pRow) => (
                    <tr key={pRow.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{pRow.id + 1}</td>
                      <td style={{ fontWeight: 600 }}>{pRow.data.name || <span style={{ color: 'var(--danger)' }}>Empty</span>}</td>
                      <td>{pRow.data.contactPhone || <span style={{ color: 'var(--danger)' }}>None found</span>}</td>
                      <td>{pRow.data.sabha || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                      <td>{pRow.data.karyakar || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                      <td style={{ fontSize: '0.8rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pRow.data.guardianDetails || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>
                      <td>
                        {pRow.lookupWarnings?.length > 0 && (
                          <div
                            style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', marginBottom: '0.25rem' }}
                            title={pRow.lookupWarnings.join(' · ')}
                          >
                            <AlertTriangle size={11} />
                            <span>{pRow.lookupWarnings.join(' · ')}</span>
                          </div>
                        )}
                        {pRow.status === 'rejected' ? (
                          <div style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }} title={pRow.note}>
                            <AlertTriangle size={12} />
                            <span>Rejected</span>
                          </div>
                        ) : pRow.status === 'duplicate' || pRow.status === 'review' ? (
                          <div style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }} title={pRow.note}>
                            <AlertTriangle size={12} />
                            <span>{pRow.status === 'duplicate' ? 'Duplicate in file' : 'To Review'}</span>
                          </div>
                        ) : pRow.status === 'update' ? (
                          <span className="badge badge-info" title={pRow.note}>Merge</span>
                        ) : pRow.status === 'unchanged' ? (
                          <span className="badge badge-info" style={{ opacity: 0.7 }} title={pRow.note}>Unchanged</span>
                        ) : (
                          <span className="badge badge-success" title={pRow.note}>New Roster</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trigger Import Action */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button 
              onClick={handleRunImport}
              className="btn btn-primary"
              style={{ padding: '0.8rem 2rem' }}
              disabled={Object.entries(REQUIRED_FIELDS).some(([key, c]) => c.required && (mappings[key] === undefined || mappings[key] === -1))}
            >
              <span>Synchronize Database</span>
            </button>
          </div>
        </div>
      )}
      
      <style>{`
        .upload-dropzone:hover {
          border-color: var(--accent) !important;
          background-color: rgba(var(--accent-rgb), 0.05) !important;
        }
      `}</style>
    </div>
  );
}
