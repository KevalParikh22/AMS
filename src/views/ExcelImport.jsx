import React, { useState, useRef } from 'react';
import { useDb } from '../context/DbContext';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';

const REQUIRED_FIELDS = {
  name: { label: 'Participant Name', required: true, synonyms: ['name', 'full name', 'balak name', 'candidate'] },
  phone: { label: 'Phone Number', required: true, synonyms: ['phone', 'contact', 'mobile', 'cell', 'phone number'] },
  sabha: { label: 'Mandal / Sabha', required: false, synonyms: ['sabha', 'mandal', 'mandal-sabha', 'class', 'group'] },
  karyakar: { label: 'Karyakar Name', required: false, synonyms: ['karyakar', 'teacher', 'karyakar name', 'mentor'] },
  guardianDetails: { label: 'Guardian Info', required: false, synonyms: ['guardian', 'parent', 'guardian contact details', 'father', 'mother'] }
};

export default function ExcelImport() {
  const { importExcelData, participants } = useDb();
  
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]); // Array of arrays from row 1 onwards
  const [mappings, setMappings] = useState({});
  const [previewRows, setPreviewRows] = useState([]);
  const [importSummary, setImportSummary] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const fileInputRef = useRef(null);

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
        
        // Parse sheet as raw matrix [ [col1, col2], [val1, val2] ]
        const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
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
        generatePreview(sheetRows, initialMappings, sheetHeaders);
      } catch (err) {
        console.error(err);
        setErrorMsg('Error reading file. Make sure the file is not corrupted.');
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  // Generate preview of mapped columns
  const generatePreview = (rows, currentMappings, currentHeaders) => {
    const previewList = rows.slice(0, 10).map((row, rowIdx) => {
      const parsedRow = {};
      Object.entries(currentMappings).forEach(([fieldKey, colIdx]) => {
        if (colIdx !== undefined && colIdx > -1) {
          parsedRow[fieldKey] = row[colIdx] !== undefined ? String(row[colIdx]).trim() : '';
        } else {
          parsedRow[fieldKey] = '';
        }
      });

      // Validations
      const errors = [];
      const warnings = [];
      
      if (!parsedRow.name) errors.push('Missing Name');
      if (!parsedRow.phone) errors.push('Missing Phone');
      
      // Duplicate check in existing master db
      if (parsedRow.phone) {
        const phoneMatch = participants.some(p => p.phone === parsedRow.phone);
        if (phoneMatch) {
          warnings.push(`Update: Will merge details into existing participant (Phone: ${parsedRow.phone})`);
        }
      }

      return {
        id: rowIdx,
        data: parsedRow,
        errors,
        warnings
      };
    });

    setPreviewRows(previewList);
  };

  // Handle mapping updates
  const handleMappingChange = (fieldKey, colIdx) => {
    const updated = { ...mappings, [fieldKey]: parseInt(colIdx) };
    setMappings(updated);
    generatePreview(rawRows, updated, headers);
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
    }).filter(row => row.name || row.phone); // Filter empty rows

    if (dataToImport.length === 0) {
      setErrorMsg('No valid rows found to import.');
      return;
    }

    const summary = importExcelData(dataToImport);
    setImportSummary(summary);
    
    // Reset state
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setMappings({});
    setPreviewRows([]);
  };

  const handleReset = () => {
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setMappings({});
    setPreviewRows([]);
    setImportSummary(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="container-padding animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Informational Guidelines Header */}
      <div className="card" style={{
        background: 'linear-gradient(to right, var(--bg-secondary), rgba(99, 102, 241, 0.02))'
      }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileSpreadsheet color="var(--accent)" size={22} />
          <span>Excel Data Synchronizer</span>
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
          Upload a master roster. The importer allows column-mapping so you don't need fixed spreadsheets headers. If a participant phone number is already registered in the registry, their information will be updated instead of duplicated.
        </p>
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
          <ul style={{ listStyle: 'none', paddingLeft: 0, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <li>➕ New Added: <strong>{importSummary.inserted} records</strong></li>
            <li>🔄 Existing Merged: <strong>{importSummary.updated} records</strong></li>
            <li>⚠️ Invalid Skipped: <strong>{importSummary.rejected} rows</strong></li>
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

          {/* Verification Preview Table */}
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span> Roster Import Preview (First 10 rows)</span>
            </h4>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Phone</th>
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
                      <td>{pRow.data.phone || <span style={{ color: 'var(--danger)' }}>Empty</span>}</td>
                      <td>{pRow.data.sabha || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                      <td>{pRow.data.karyakar || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                      <td style={{ fontSize: '0.8rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pRow.data.guardianDetails || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>
                      <td>
                        {pRow.errors.length > 0 ? (
                          <div style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }}>
                            <AlertTriangle size={12} />
                            <span>{pRow.errors.join(', ')}</span>
                          </div>
                        ) : pRow.warnings.length > 0 ? (
                          <div style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }}>
                            <AlertTriangle size={12} />
                            <span>Merge</span>
                          </div>
                        ) : (
                          <span className="badge badge-success">New Roster</span>
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
          background-color: rgba(99, 102, 241, 0.05) !important;
        }
      `}</style>
    </div>
  );
}
