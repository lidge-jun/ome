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
    <div id="sb-cli-quota"></div>
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
    <div id="add-error" class="add-error"></div>
    <div class="field-row">
      <div class="field"><label>Name</label><input id="add-name" placeholder="Employee name" maxlength="30"></div>
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

  <div id="emp-empty" class="emp-empty" style="display:none">
    No employees yet. Click <strong>+ 추가</strong> to register your first agent.
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
</main>

<div id="toast-container"></div>

${getDashboardScript()}
</body>
</html>`;
}

function getDashboardScript(): string {
    return `<script>
const CLI_LIST=['claude','codex','gemini','copilot','opencode'];
const MODEL_MAP={claude:['opus','sonnet','haiku'],codex:['gpt-5.5','o3','o4-mini'],gemini:['gemini-3.1-pro','gemini-2.5-flash'],copilot:['gpt-4o'],opencode:['']};
const CLI_SVGS={
claude:'<svg height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fill-rule="nonzero"/></svg>',
codex:'<svg fill="currentColor" fill-rule="evenodd" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"/></svg>',
gemini:'<svg height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"/></svg>',
copilot:'<svg height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Z"/></svg>',
opencode:'<svg height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>'
};
let refreshTimer=null;

function showToast(msg, type){
  const c=document.getElementById('toast-container');
  const t=document.createElement('div');
  t.className='toast toast-'+type;
  t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>t.classList.add('show'),10);
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300)},3000);
}

async function loadAll(){
  try{
    const [status,emps,jobs,liveQuota]=await Promise.all([
      fetch('/api/status').then(r=>r.json()),
      fetch('/api/employees').then(r=>r.json()),
      fetch('/api/jobs').then(r=>r.json()),
      fetch('/api/quota/live').then(r=>r.json()).catch(()=>({source:'unavailable'})),
    ]);
    renderSidebarStatus(status);
    renderSidebarStats(status);
    renderCliQuota(liveQuota);
    renderEmployeeCards(emps,liveQuota);
    renderJobs(jobs);
  }catch(e){console.error('loadAll',e)}
}

function renderSidebarStatus(status){
  const sb=document.getElementById('sb-status');
  sb.className='status-badge '+(status.busy?'running':'idle');
  sb.textContent=status.busy?'running':'idle';
}

function renderSidebarStats(status){
  const el=document.getElementById('sb-stats');
  el.replaceChildren();
  [{l:'Employees',v:status.employees},{l:'Active Jobs',v:status.activeJobs},{l:'Queue',v:status.queueDepth}].forEach(s=>{
    const row=document.createElement('div');row.className='stat-row';
    const lbl=document.createElement('span');lbl.className='label';lbl.textContent=s.l;
    const val=document.createElement('span');val.className='value';val.textContent=String(s.v);
    row.appendChild(lbl);row.appendChild(val);el.appendChild(row);
  });
}

function renderCliQuota(lq){
  const el=document.getElementById('sb-cli-quota');
  el.replaceChildren();
  if(lq.source==='unavailable'){
    const w=document.createElement('div');w.className='cli-unavailable';w.textContent='cli-jaw not connected';
    el.appendChild(w);return;
  }
  const order=['claude','codex','gemini','opencode','copilot'];
  for(const cli of order){
    const entry=lq[cli];
    if(!entry)continue;
    el.appendChild(makeCliCard(cli,entry));
  }
}

function makeCliCard(cli,entry){
  const card=document.createElement('div');card.className='cli-quota-card';
  const hdr=document.createElement('div');hdr.className='cli-quota-header';
  const dot=document.createElement('span');dot.className='cli-dot';
  if(entry.authenticated===false)dot.classList.add('red');
  else if(entry.error)dot.classList.add('yellow');
  else dot.classList.add('online');
  const icon=document.createElement('span');icon.className='cli-svg';icon.innerHTML=CLI_SVGS[cli]||'';
  const name=document.createElement('span');name.className='cli-name';name.textContent=cli;
  hdr.appendChild(dot);hdr.appendChild(icon);hdr.appendChild(name);
  card.appendChild(hdr);

  if(entry.account){
    const acct=document.createElement('div');acct.className='cli-account';
    const parts=[];
    if(entry.account.email)parts.push(entry.account.email);
    if(entry.account.type)parts.push(entry.account.type);
    if(entry.account.plan)parts.push(entry.account.plan);
    if(entry.account.tier)parts.push(entry.account.tier);
    acct.textContent=parts.join(' \\u00b7 ');
    card.appendChild(acct);
  }

  if(entry.authenticated===false){
    const w=document.createElement('div');w.className='cli-auth-warn';
    w.textContent='\\u26a0 인증 필요';
    card.appendChild(w);return card;
  }

  if(entry.windows&&entry.windows.length>0){
    const bars=document.createElement('div');bars.className='cli-bars';
    entry.windows.forEach(win=>{
      const row=document.createElement('div');row.className='quota-window';
      const lbl=document.createElement('span');lbl.className='win-label';lbl.textContent=shortLabel(win.label);
      const track=document.createElement('div');track.className='win-bar';
      const fill=document.createElement('div');fill.className='win-fill';
      const pct=Math.min(win.percent||0,100);
      fill.style.width=pct+'%';
      fill.classList.add(pct>=80?'over':pct>=50?'warn':'ok');
      track.appendChild(fill);
      const pctText=document.createElement('span');pctText.className='win-pct';pctText.textContent=Math.round(pct)+'%';
      const reset=document.createElement('span');reset.className='win-reset';reset.textContent=shortReset(win.resetsAt);
      row.appendChild(lbl);row.appendChild(track);row.appendChild(pctText);row.appendChild(reset);
      bars.appendChild(row);
    });
    card.appendChild(bars);
  }
  return card;
}

function shortLabel(l){
  if(!l)return'';
  var m=l.match(/^(\\d+)-(hour|day)/);if(m)return m[1]+(m[2]==='hour'?'h':'d');return l;
}
function shortReset(r){
  if(!r)return'';
  const d=new Date(typeof r==='number'?r:r);
  if(isNaN(d.getTime()))return'';
  const now=new Date();
  if(d.toDateString()===now.toDateString())return d.getHours()+':'+(d.getMinutes()<10?'0':'')+d.getMinutes();
  return(d.getMonth()+1)+'/'+d.getDate();
}

function renderEmployeeCards(emps,liveQuota){
  const grid=document.getElementById('emp-grid');
  const empty=document.getElementById('emp-empty');
  grid.replaceChildren();
  if(emps.length===0){empty.style.display='block';return;}
  empty.style.display='none';

  emps.forEach(e=>{
    const card=document.createElement('div');card.className='emp-card';
    card.dataset.name=e.name;
    card.dataset.origCli=e.cli;
    card.dataset.origModel=e.model||'';
    card.dataset.origRole=e.role||'';

    const header=document.createElement('div');header.className='emp-card-header';
    const cliEntry=liveQuota&&liveQuota[e.cli];
    const authOk=cliEntry&&cliEntry.authenticated!==false;
    const dot=document.createElement('span');dot.className='dot '+(authOk?'idle':'warn');
    const iconSpan=document.createElement('span');iconSpan.className='emp-cli-icon';iconSpan.innerHTML=CLI_SVGS[e.cli]||'';
    const nameEl=document.createElement('span');nameEl.className='name';nameEl.textContent=e.name;
    const del=document.createElement('button');del.className='del-btn';del.textContent='\\u00d7';
    del.onclick=()=>delEmp(e.name);
    header.appendChild(dot);header.appendChild(iconSpan);header.appendChild(nameEl);header.appendChild(del);

    const row1=document.createElement('div');row1.className='field-row';
    const cliField=makeSelectField('CLI',e.cli,CLI_LIST,card);
    const models=MODEL_MAP[e.cli]||[''];
    const modelField=makeSelectField('Model',e.model||'',models,card,true);
    cliField.select.addEventListener('change',()=>{
      const newModels=MODEL_MAP[cliField.select.value]||[''];
      updateSelectOptions(modelField.select,newModels);
      markDirty(card);
    });
    modelField.select.addEventListener('change',()=>markDirty(card));
    row1.appendChild(cliField.el);row1.appendChild(modelField.el);

    const row2=document.createElement('div');row2.className='field-row';
    const roleField=makeInputField('Role',e.role||'');
    roleField.input.addEventListener('input',()=>markDirty(card));
    row2.appendChild(roleField.el);

    const saveRow=document.createElement('div');saveRow.className='save-row hidden';
    const saveBtn=document.createElement('button');saveBtn.className='save-btn';saveBtn.textContent='Save';
    saveBtn.onclick=()=>saveEmp(card);
    saveRow.appendChild(saveBtn);

    card.appendChild(header);card.appendChild(row1);card.appendChild(row2);card.appendChild(saveRow);
    grid.appendChild(card);
  });
}

function makeSelectField(label,value,options,card){
  const f=document.createElement('div');f.className='field';
  const l=document.createElement('label');l.textContent=label;
  const s=document.createElement('select');
  options.forEach(opt=>{
    const o=document.createElement('option');o.value=opt;o.textContent=opt||'(default)';
    if(opt===value)o.selected=true;
    s.appendChild(o);
  });
  if(value&&!options.includes(value)){
    const o=document.createElement('option');o.value=value;o.textContent=value;o.selected=true;
    s.insertBefore(o,s.firstChild);
  }
  f.appendChild(l);f.appendChild(s);
  return {el:f,select:s};
}

function makeInputField(label,value){
  const f=document.createElement('div');f.className='field';
  const l=document.createElement('label');l.textContent=label;
  const i=document.createElement('input');i.value=value;
  f.appendChild(l);f.appendChild(i);
  return {el:f,input:i};
}

function updateSelectOptions(sel,options){
  const cur=sel.value;
  sel.replaceChildren();
  options.forEach(opt=>{
    const o=document.createElement('option');o.value=opt;o.textContent=opt||'(default)';
    if(opt===cur)o.selected=true;
    sel.appendChild(o);
  });
}

function markDirty(card){
  const row=card.querySelector('.save-row');
  if(row)row.classList.remove('hidden');
}

async function saveEmp(card){
  const name=card.dataset.name;
  const cli=card.querySelector('.field-row:first-of-type select').value;
  const model=card.querySelectorAll('.field-row')[0].querySelectorAll('select')[1].value;
  const role=card.querySelectorAll('.field-row')[1].querySelector('input').value;
  const resp=await fetch('/api/employees/'+encodeURIComponent(name),{
    method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({cli,model:model||null,role:role||null})
  });
  if(resp.ok){showToast(name+' updated','success')}
  else{const e=await resp.json().catch(()=>({}));showToast(e.error||'Update failed','error')}
  card.querySelector('.save-row').classList.add('hidden');
  loadAll();
}

function renderJobs(jobs){
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
}

function toggleAddForm(){
  document.getElementById('add-form').classList.toggle('open');
  document.getElementById('add-error').textContent='';
}

async function addEmp(){
  const nameInput=document.getElementById('add-name');
  const errEl=document.getElementById('add-error');
  const n=nameInput.value.trim();
  errEl.textContent='';
  if(!n){errEl.textContent='Name is required';nameInput.focus();return;}
  if(n.length>30){errEl.textContent='Name too long (max 30)';return;}
  const resp=await fetch('/api/employees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    name:n,
    cli:document.getElementById('add-cli').value,
    model:document.getElementById('add-model').value||null,
    role:document.getElementById('add-role').value||null
  })});
  if(resp.ok){
    showToast(n+' added','success');
    nameInput.value='';document.getElementById('add-model').value='';document.getElementById('add-role').value='';
    toggleAddForm();loadAll();
  }else{
    const e=await resp.json().catch(()=>({}));
    if(resp.status===409)errEl.textContent='Employee "'+n+'" already exists';
    else errEl.textContent=e.error||'Failed to add';
  }
}

async function delEmp(name){
  if(!confirm(name+' 삭제?'))return;
  const resp=await fetch('/api/employees/'+encodeURIComponent(name),{method:'DELETE'});
  if(resp.ok)showToast(name+' removed','warn');
  else showToast('Delete failed','error');
  loadAll();
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
<\/script>`;
}
