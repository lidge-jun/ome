import { getDashboardStyles } from './dashboard-styles.js';

export function getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OME Dashboard</title>
<style>${getDashboardStyles()}</style>
</head>
<body>

<aside class="sidebar">
  <div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
      <span style="font-size:1.4rem">&#9881;</span>
      <h1>OME</h1>
    </div>
    <div>
      <h3 style="font-size:.75rem;color:#888;text-transform:uppercase;margin-bottom:6px">상태</h3>
      <span id="sb-status" class="status-badge idle">idle</span>
    </div>
  </div>

  <div class="sidebar-section">
    <h3>통계</h3>
    <div id="sb-stats"></div>
  </div>

  <div class="sidebar-section">
    <h3>CLI 상태</h3>
    <div id="sb-cli-list"></div>
  </div>

  <div class="refresh-row">
    <button class="refresh-btn" onclick="loadAll()">&#8635; Refresh</button>
    <select id="refresh-mode" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:.8rem;background:#fff">
      <option value="auto">자동</option>
      <option value="manual">수동</option>
    </select>
  </div>
</aside>

<main class="main">
  <div class="main-header">
    <h2>직원 <span class="help-icon" title="등록된 AI CLI 에이전트">?</span></h2>
    <button class="add-btn" onclick="toggleAddForm()">+ 추가</button>
  </div>

  <div id="add-form" class="add-form">
    <h3>새 직원 추가</h3>
    <div class="field-row">
      <div class="field"><label>Name</label><input id="add-name" placeholder="Employee name"></div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>CLI</label>
        <select id="add-cli"><option>claude</option><option>codex</option><option>gemini</option><option>copilot</option><option>opencode</option></select>
      </div>
      <div class="field"><label>Model</label><input id="add-model" placeholder="default"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Role</label><input id="add-role" placeholder="역할 설명"></div>
    </div>
    <div class="actions">
      <button class="primary" onclick="addEmp()">추가</button>
      <button class="cancel" onclick="toggleAddForm()">취소</button>
    </div>
  </div>

  <div id="emp-grid" class="emp-grid"></div>

  <div class="jobs-section">
    <h2>Jobs</h2>
    <table class="job-table">
      <thead><tr><th>ID</th><th>CLI</th><th>Status</th><th>Phase</th><th>Created</th><th></th></tr></thead>
      <tbody id="job-list"></tbody>
    </table>
    <div id="job-detail"><h3>Job Detail</h3><pre id="job-detail-content"></pre></div>
  </div>

  <div class="quota-section">
    <h2>Quota</h2>
    <div class="quota-form">
      <div class="field"><label>Daily limit</label><input id="q-daily" type="number" placeholder="0"></div>
      <div class="field"><label>Hourly limit</label><input id="q-hourly" type="number" placeholder="0"></div>
      <button onclick="saveQuota()">Save</button>
    </div>
  </div>
</main>

<script>
const CLI_ICONS={claude:'\\u2728',codex:'\\u2699',gemini:'\\u2600',copilot:'\\u2708',opencode:'\\u2318'};
let refreshTimer=null;

async function loadAll(){
  const [status,emps,jobs,quota]=await Promise.all([
    fetch('/api/status').then(r=>r.json()),
    fetch('/api/employees').then(r=>r.json()),
    fetch('/api/jobs').then(r=>r.json()),
    fetch('/api/quota').then(r=>r.json()).catch(()=>({})),
  ]);

  // Sidebar status
  const sb=document.getElementById('sb-status');
  sb.className='status-badge '+(status.busy?'running':'idle');
  sb.textContent=status.busy?'running':'idle';

  // Sidebar stats
  const stats=document.getElementById('sb-stats');
  stats.replaceChildren();
  [{l:'Employees',v:status.employees},{l:'Active Jobs',v:status.activeJobs},{l:'Queue',v:status.queueDepth}].forEach(s=>{
    const row=document.createElement('div');row.className='stat-row';
    const lbl=document.createElement('span');lbl.className='label';lbl.textContent=s.l;
    const val=document.createElement('span');val.className='value';val.textContent=String(s.v);
    row.appendChild(lbl);row.appendChild(val);stats.appendChild(row);
  });

  // Sidebar CLI list
  const cliList=document.getElementById('sb-cli-list');
  cliList.replaceChildren();
  const cliSet=new Set();
  emps.forEach(e=>{
    if(cliSet.has(e.cli))return;
    cliSet.add(e.cli);
    const item=document.createElement('div');item.className='cli-item';
    const dot=document.createElement('span');dot.className='cli-dot online';
    const icon=document.createElement('span');icon.className='cli-icon';icon.textContent=CLI_ICONS[e.cli]||'\\u25cf';
    const name=document.createElement('span');name.className='cli-name';name.textContent=e.cli;
    const detail=document.createElement('span');detail.className='cli-detail';
    const cliEmps=emps.filter(x=>x.cli===e.cli);
    detail.textContent=cliEmps.map(x=>x.name).join(', ');
    item.appendChild(dot);item.appendChild(icon);item.appendChild(name);item.appendChild(detail);
    cliList.appendChild(item);
  });

  // Employee cards
  const grid=document.getElementById('emp-grid');
  grid.replaceChildren();
  emps.forEach(e=>{
    const card=document.createElement('div');card.className='emp-card';
    const header=document.createElement('div');header.className='emp-card-header';
    const dot=document.createElement('span');dot.className='dot idle';
    const nameEl=document.createElement('span');nameEl.className='name';nameEl.textContent=e.name;
    const del=document.createElement('button');del.className='del-btn';del.textContent='\\u00d7';
    del.onclick=()=>delEmp(e.name);
    header.appendChild(dot);header.appendChild(nameEl);header.appendChild(del);

    const row1=document.createElement('div');row1.className='field-row';
    row1.appendChild(makeField('CLI',e.cli,true));
    row1.appendChild(makeField('Model',e.model||'-',true));

    const row2=document.createElement('div');row2.className='field-row';
    row2.appendChild(makeField('Role',e.role||'-',true));

    const statusEl=document.createElement('div');statusEl.className='emp-status';
    statusEl.textContent='\\u25cf idle';

    card.appendChild(header);card.appendChild(row1);card.appendChild(row2);card.appendChild(statusEl);
    grid.appendChild(card);
  });

  // Jobs
  const jl=document.getElementById('job-list');
  jl.replaceChildren();
  jobs.slice(0,20).forEach(j=>{
    const tr=document.createElement('tr');
    const idTd=document.createElement('td');idTd.style.fontFamily='monospace';idTd.style.fontSize='.8rem';idTd.textContent=j.id.slice(0,16);tr.appendChild(idTd);
    const cliTd=document.createElement('td');cliTd.textContent=j.cli;tr.appendChild(cliTd);
    const stTd=document.createElement('td');const badge=document.createElement('span');badge.className='job-badge '+j.status;badge.textContent=j.status;stTd.appendChild(badge);tr.appendChild(stTd);
    const phTd=document.createElement('td');phTd.textContent=j.phase||'-';tr.appendChild(phTd);
    const dtTd=document.createElement('td');dtTd.textContent=new Date(j.createdAt).toLocaleTimeString();tr.appendChild(dtTd);
    const actTd=document.createElement('td');const ib=document.createElement('button');ib.className='inspect-btn';ib.textContent='Inspect';ib.onclick=()=>inspectJob(j.id);actTd.appendChild(ib);tr.appendChild(actTd);
    jl.appendChild(tr);
  });

  if(quota.dailyLimit)document.getElementById('q-daily').value=quota.dailyLimit;
  if(quota.hourlyLimit)document.getElementById('q-hourly').value=quota.hourlyLimit;
}

function makeField(label,value,readonly){
  const f=document.createElement('div');f.className='field';
  const l=document.createElement('label');l.textContent=label;
  const v=document.createElement('input');v.value=value;v.readOnly=!!readonly;
  if(readonly)v.style.background='#f5f5f5';
  f.appendChild(l);f.appendChild(v);return f;
}

function toggleAddForm(){
  document.getElementById('add-form').classList.toggle('open');
}

async function addEmp(){
  const n=document.getElementById('add-name').value.trim();
  if(!n)return;
  await fetch('/api/employees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    name:n,
    cli:document.getElementById('add-cli').value,
    model:document.getElementById('add-model').value||null,
    role:document.getElementById('add-role').value||null
  })});
  document.getElementById('add-name').value='';
  document.getElementById('add-model').value='';
  document.getElementById('add-role').value='';
  toggleAddForm();
  loadAll();
}

async function delEmp(name){
  if(!confirm(name+' 삭제?'))return;
  await fetch('/api/employees/'+encodeURIComponent(name),{method:'DELETE'});
  loadAll();
}

async function saveQuota(){
  await fetch('/api/quota',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    dailyLimit:parseInt(document.getElementById('q-daily').value)||0,
    hourlyLimit:parseInt(document.getElementById('q-hourly').value)||0
  })});
}

async function inspectJob(id){
  const data=await fetch('/api/jobs/'+encodeURIComponent(id)).then(r=>r.json());
  document.getElementById('job-detail').style.display='block';
  document.getElementById('job-detail-content').textContent=JSON.stringify(data,null,2);
}

document.getElementById('refresh-mode').addEventListener('change',e=>{
  if(e.target.value==='auto'){refreshTimer=setInterval(loadAll,5000)}
  else{clearInterval(refreshTimer);refreshTimer=null}
});

loadAll();
refreshTimer=setInterval(loadAll,5000);
</script>
</body>
</html>`;
}
