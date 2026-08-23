import React, { useState, useRef } from 'react';
import { useDb } from '../context/DbContext';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';

// The two bulk mapping importers, moved here from Admin Control alongside the
// lists they edit. Both keep the preview-then-apply shape: nothing is written
// until the admin confirms, because a typo'd mandal would otherwise silently
// become a real mandal in every dropdown.

const KARYAKAR_SYNONYMS = ['karyakar', 'mentor', 'teacher', 'responsible'];
const SABHA_SYNONYMS = ['sabha', 'mandal', 'class', 'group'];
const AREA_SYNONYMS = ['area', 'region', 'zone', 'cluster', 'kshetra'];

const readSheet = (file, onMatrix, onError) => {
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
      const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        header: 1, defval: '', raw: false
      });
      if (matrix.length < 2) return onError('That file has no data rows.');
      onMatrix(matrix);
    } catch (err) {
      console.error(err);
      onError('Could not read that file. Make sure it is a .csv or .xlsx.');
    }
  };
  reader.readAsArrayBuffer(file);
};

const panelStyle = {
  border: '1px dashed var(--border-color)',
  borderRadius: 'var(--radius-sm)',
  padding: '0.9rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem'
};

export default function LookupImporters() {
  const { sabhas, sabhaNames, karyakars, participants, areas, addLookupEntries } = useDb();

  const [mapPreview, setMapPreview] = useState(null);
  const [applyRemaps, setApplyRemaps] = useState(true);
  // Off by default: this rewrites participant records, not just the lookup list.
  const [cascadeParticipants, setCascadeParticipants] = useState(false);
  const [mapMsg, setMapMsg] = useState('');
  const mapFileRef = useRef(null);

  const [areaPreview, setAreaPreview] = useState(null);
  const [areaMsg, setAreaMsg] = useState('');
  const areaFileRef = useRef(null);

  // --- karyakar -> mandal ------------------------------------------------
  const handleMappingFile = (e) => {
    setMapMsg(''); setMapPreview(null);
    const file = e.target.files[0];
    if (!file) return;
    readSheet(file, (matrix) => {
      const headers = matrix[0].map(h => String(h).trim().toLowerCase());
      // Match mandal first, so "Karyakar Name" is not captured by a loose
      // mandal synonym, and vice versa.
      const sabhaCol = headers.findIndex(h => SABHA_SYNONYMS.some(x => h.includes(x)));
      const karyakarCol = headers.findIndex((h, i) => i !== sabhaCol && KARYAKAR_SYNONYMS.some(x => h.includes(x)));
      if (karyakarCol === -1 || sabhaCol === -1) {
        setMapMsg(`Could not find both columns. Found headers: ${matrix[0].join(', ') || '(none)'}.`);
        return;
      }

      const seen = new Set();
      const newKaryakars = [], remaps = [], unchanged = [], newSabhas = new Set();
      let skipped = 0;
      matrix.slice(1).forEach(row => {
        const name = String(row[karyakarCol] ?? '').trim();
        const sabha = String(row[sabhaCol] ?? '').trim();
        if (!name || !sabha) { skipped++; return; }
        if (seen.has(name.toLowerCase())) { skipped++; return; }
        seen.add(name.toLowerCase());
        if (!sabhaNames.includes(sabha)) newSabhas.add(sabha);
        const existing = karyakars.find(k => k.name === name);
        if (!existing) newKaryakars.push({ name, sabha });
        else if (existing.sabha !== sabha) remaps.push({ name, from: existing.sabha, to: sabha });
        else unchanged.push(name);
      });

      // How many balaks would follow their karyakar — the same rule the cascade
      // applies: active records still sitting in the karyakar's old mandal.
      const moves = new Map(remaps.map(r => [r.name, r]));
      const affectedParticipants = participants.filter(p => {
        if (p.status !== 'approved' && p.status !== 'pending') return false;
        const m = moves.get(p.karyakar);
        return !!m && p.sabha === m.from;
      }).length;

      setMapPreview({ newKaryakars, remaps, unchanged, newSabhas: [...newSabhas], skipped, affectedParticipants });
    }, setMapMsg);
  };

  const handleApplyMapping = () => {
    if (!mapPreview) return;
    const result = addLookupEntries({
      sabhas: mapPreview.newSabhas,
      karyakars: mapPreview.newKaryakars,
      remapKaryakars: applyRemaps ? mapPreview.remaps.map(r => ({ name: r.name, sabha: r.to })) : [],
      cascadeParticipants: applyRemaps && cascadeParticipants
    });
    if (result.error) { setMapMsg(result.error); return; }
    setMapMsg(
      `Added ${result.addedKaryakars.length} karyakar(s) and ${result.addedSabhas.length} mandal(s)` +
      (result.remapped.length ? `, remapped ${result.remapped.length}` : '') +
      (result.movedParticipants ? `, moved ${result.movedParticipants} balak(s)` : '') + '.'
    );
    setMapPreview(null);
    if (mapFileRef.current) mapFileRef.current.value = '';
    setTimeout(() => setMapMsg(''), 6000);
  };

  const handleDownloadMappingSample = () => {
    const rows = (karyakars.length ? karyakars : [{ name: 'Ghanshyam Patel', sabha: sabhaNames[0] || 'Bal Sabha - Sub-group A1' }])
      .map(k => ({ 'Karyakar Name': k.name, 'Mandal-Sabha': k.sabha }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: ['Karyakar Name', 'Mandal-Sabha'] }), 'Karyakar Mapping');
    XLSX.writeFile(wb, 'karyakar_mapping_sample.csv', { bookType: 'csv' });
  };

  // --- mandal -> area ----------------------------------------------------
  const handleAreaFile = (e) => {
    setAreaMsg(''); setAreaPreview(null);
    const file = e.target.files[0];
    if (!file) return;
    readSheet(file, (matrix) => {
      const headers = matrix[0].map(h => String(h).trim().toLowerCase());
      const areaCol = headers.findIndex(h => AREA_SYNONYMS.some(x => h.includes(x)));
      const sabhaCol = headers.findIndex((h, i) => i !== areaCol && SABHA_SYNONYMS.some(x => h.includes(x)));
      if (areaCol === -1 || sabhaCol === -1) {
        setAreaMsg(`Could not find both columns. Found headers: ${matrix[0].join(', ') || '(none)'}.`);
        return;
      }
      const seen = new Set();
      const assignments = [], newSabhas = [], changes = [], unchanged = [], newAreas = new Set();
      let skipped = 0;
      matrix.slice(1).forEach(row => {
        const sabha = String(row[sabhaCol] ?? '').trim();
        const area = String(row[areaCol] ?? '').trim();
        if (!sabha || !area) { skipped++; return; }
        if (seen.has(sabha.toLowerCase())) { skipped++; return; }
        seen.add(sabha.toLowerCase());
        assignments.push({ sabha, area });
        if (!areas.includes(area)) newAreas.add(area);
        const existing = sabhas.find(s => s.name === sabha);
        if (!existing) newSabhas.push({ sabha, area });
        else if (existing.area !== area) changes.push({ sabha, from: existing.area, to: area });
        else unchanged.push(sabha);
      });
      setAreaPreview({ assignments, newSabhas, changes, unchanged, newAreas: [...newAreas], skipped });
    }, setAreaMsg);
  };

  const handleApplyAreas = () => {
    if (!areaPreview) return;
    const result = addLookupEntries({ sabhaAreas: areaPreview.assignments });
    if (result.error) { setAreaMsg(result.error); return; }
    setAreaMsg(
      `Assigned ${result.areaChanges.length} mandal(s) to an area` +
      (result.addedSabhas.length ? `, created ${result.addedSabhas.length} new mandal(s)` : '') +
      (areaPreview.unchanged.length ? `, ${areaPreview.unchanged.length} already correct` : '') + '.'
    );
    setAreaPreview(null);
    if (areaFileRef.current) areaFileRef.current.value = '';
    setTimeout(() => setAreaMsg(''), 6000);
  };

  const handleDownloadAreaSample = () => {
    const rows = (sabhas.length ? sabhas : [{ name: 'Bal Sabha - Sub-group A1', area: 'North Zone' }])
      .map(s => ({ 'Mandal-Sabha': s.name, 'Area': s.area }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: ['Mandal-Sabha', 'Area'] }), 'Area Mapping');
    XLSX.writeFile(wb, 'area_mapping_sample.csv', { bookType: 'csv' });
  };

  const Header = ({ title, onSample }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{title}</span>
      <button onClick={onSample} className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}>
        <Download size={12} /><span>Sample</span>
      </button>
    </div>
  );

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>

      {/* Karyakar -> mandal */}
      <div style={panelStyle}>
        <Header title="Import karyakar → mandal mapping" onSample={handleDownloadMappingSample} />
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          Two columns: <strong>Karyakar Name</strong> and <strong>Mandal-Sabha</strong>.
        </p>
        <input type="file" ref={mapFileRef} accept=".csv,.xlsx,.xls" onChange={handleMappingFile}
          className="form-control" style={{ fontSize: '0.75rem', padding: '0.35rem' }} />
        {mapMsg && <div className="badge badge-info" style={{ display: 'block', padding: '0.5rem', fontSize: '0.75rem' }}>{mapMsg}</div>}

        {mapPreview && (
          <div style={{ fontSize: '0.76rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <span className="badge badge-success">New: {mapPreview.newKaryakars.length}</span>
              <span className="badge badge-warning">Mapping changes: {mapPreview.remaps.length}</span>
              <span className="badge badge-info" style={{ opacity: 0.75 }}>Unchanged: {mapPreview.unchanged.length}</span>
              {mapPreview.skipped > 0 && <span className="badge badge-danger">Skipped: {mapPreview.skipped}</span>}
            </div>
            {mapPreview.newSabhas.length > 0 && (
              <div style={{ color: 'var(--warning)' }}>
                <strong>These mandals do not exist yet and will be created:</strong> {mapPreview.newSabhas.join(', ')}
              </div>
            )}
            {mapPreview.remaps.length > 0 && (
              <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={applyRemaps} onChange={(e) => setApplyRemaps(e.target.checked)} />
                <span>
                  Apply {mapPreview.remaps.length} mapping change(s):{' '}
                  {mapPreview.remaps.slice(0, 4).map(r => `${r.name} ${r.from} → ${r.to}`).join('; ')}
                  {mapPreview.remaps.length > 4 && ` …and ${mapPreview.remaps.length - 4} more`}
                </span>
              </label>
            )}
            {applyRemaps && mapPreview.affectedParticipants > 0 && (
              <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', cursor: 'pointer', paddingLeft: '1.25rem' }}>
                <input type="checkbox" checked={cascadeParticipants} onChange={(e) => setCascadeParticipants(e.target.checked)} />
                <span>Also move {mapPreview.affectedParticipants} balak(s) to follow their karyakar</span>
              </label>
            )}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button onClick={handleApplyMapping} className="btn btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.76rem' }}>Apply</button>
              <button onClick={() => { setMapPreview(null); if (mapFileRef.current) mapFileRef.current.value = ''; }}
                className="btn btn-ghost" style={{ padding: '0.35rem 0.8rem', fontSize: '0.76rem' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Mandal -> area */}
      <div style={panelStyle}>
        <Header title="Import mandal → area mapping" onSample={handleDownloadAreaSample} />
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          Two columns: <strong>Mandal-Sabha</strong> and <strong>Area</strong>.
        </p>
        <input type="file" ref={areaFileRef} accept=".csv,.xlsx,.xls" onChange={handleAreaFile}
          className="form-control" style={{ fontSize: '0.75rem', padding: '0.35rem' }} />
        {areaMsg && <div className="badge badge-info" style={{ display: 'block', padding: '0.5rem', fontSize: '0.75rem' }}>{areaMsg}</div>}

        {areaPreview && (
          <div style={{ fontSize: '0.76rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <span className="badge badge-warning">Area changes: {areaPreview.changes.length}</span>
              <span className="badge badge-success">New mandals: {areaPreview.newSabhas.length}</span>
              <span className="badge badge-info" style={{ opacity: 0.75 }}>Already correct: {areaPreview.unchanged.length}</span>
              {areaPreview.skipped > 0 && <span className="badge badge-danger">Skipped: {areaPreview.skipped}</span>}
            </div>
            {areaPreview.newAreas.length > 0 && (
              <div style={{ color: 'var(--text-secondary)' }}><strong>New areas:</strong> {areaPreview.newAreas.join(', ')}</div>
            )}
            {areaPreview.changes.length > 0 && (
              <div style={{ color: 'var(--warning)' }}>
                <strong>Moving:</strong> {areaPreview.changes.slice(0, 5).map(c => `${c.sabha}: ${c.from} → ${c.to}`).join('; ')}
                {areaPreview.changes.length > 5 && ` …+${areaPreview.changes.length - 5} more`}
              </div>
            )}
            {areaPreview.newSabhas.length > 0 && (
              <div style={{ color: 'var(--warning)' }}>
                <strong>These mandals will be created:</strong> {areaPreview.newSabhas.map(s => s.sabha).join(', ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button onClick={handleApplyAreas} className="btn btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.76rem' }}>Apply</button>
              <button onClick={() => { setAreaPreview(null); if (areaFileRef.current) areaFileRef.current.value = ''; }}
                className="btn btn-ghost" style={{ padding: '0.35rem 0.8rem', fontSize: '0.76rem' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
