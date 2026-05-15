export function getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OME Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a0a;color:#e0e0e0;padding:24px}
h1{font-size:1.4rem;margin-bottom:16px;color:#fff}
h2{font-size:1.1rem;margin:24px 0 12px;color:#ccc;border-bottom:1px solid #222;padding-bottom:6px}
table{width:100%;border-collapse:collapse;margin-bottom:12px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #1a1a1a}
th{color:#888;font-size:.85rem;text-transform:uppercase}
td{font-size:.9rem}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:600}
.running{background:#1a3a1a;color:#4ade80}
.completed{background:#1a2a3a;color:#60a5fa}
.failed{background:#3a1a1a;color:#f87171}
.cancelled{background:#2a2a1a;color:#facc15}
button{background:#1a1a2e;color:#e0e0e0;border:1px solid #333;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:.85rem}
button:hover{background:#2a2a4e}
button.danger{border-color:#7f1d1d}
button.danger:hover{background:#7f1d1d}
input,select{background:#111;color:#e0e0e0;border:1px solid #333;padding:6px 10px;border-radius:4px;font-size:.85rem}
.form-row{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.stat{display:inline-block;margin-right:24px;padding:8px 16px;background:#111;border-radius:6px}
.stat-val{font-size:1.4rem;font-weight:700;color:#fff}
.stat-label{font-size:.75rem;color:#888}
#refresh{position:fixed;top:16px;right:16px;z-index:10}
#job-detail{display:none;margin-top:16px;padding:16px;background:#111;border-radius:8px}
#job-detail pre{white-space:pre-wrap;font-size:.85rem;max-height:400px;overflow:auto}
</style>
</head>
<body>
<button id="refresh" onclick="loadAll()">Refresh</button>
<h1>OME Dashboard</h1>
<div id="stats"></div>
<h2>Employees</h2>
<div class="form-row">
<input id="emp-name" placeholder="Name" style="width:120px">
<select id="emp-cli"><option>claude</option><option>codex</option><option>gemini</option><option>copilot</option></select>
<input id="emp-model" placeholder="Model" style="width:140px">
<input id="emp-role" placeholder="Role" style="width:140px">
<button onclick="addEmp()">Add</button>
</div>
<table><thead><tr><th>Name</th><th>CLI</th><th>Model</th><th>Role</th><th></th></tr></thead><tbody id="emp-list"></tbody></table>
<h2>Quota</h2>
<div class="form-row">
<label>Daily limit: <input id="q-daily" type="number" style="width:80px"></label>
<label>Hourly limit: <input id="q-hourly" type="number" style="width:80px"></label>
<button onclick="saveQuota()">Save</button>
</div>
<h2>Jobs</h2>
<table><thead><tr><th>ID</th><th>CLI</th><th>Status</th><th>Phase</th><th>Created</th><th></th></tr></thead><tbody id="job-list"></tbody></table>
<div id="job-detail"><h2>Job Detail</h2><pre id="job-detail-content"></pre></div>
<script>
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
async function loadAll(){
  const [status,emps,jobs,quota]=await Promise.all([
    fetch('/api/status').then(r=>r.json()),
    fetch('/api/employees').then(r=>r.json()),
    fetch('/api/jobs').then(r=>r.json()),
    fetch('/api/quota').then(r=>r.json()).catch(()=>({})),
  ]);
  const sd=document.getElementById('stats');
  sd.innerHTML='';
  [{v:status.employees,l:'Employees'},{v:status.activeJobs,l:'Active Jobs'},{v:status.queueDepth,l:'Queue'}].forEach(s=>{
    const sp=document.createElement('span');sp.className='stat';
    sp.innerHTML='<span class="stat-val">'+esc(String(s.v))+'</span><br><span class="stat-label">'+esc(s.l)+'</span>';
    sd.appendChild(sp);
  });
  const el=document.getElementById('emp-list');el.innerHTML='';
  emps.forEach(e=>{
    const tr=document.createElement('tr');
    [e.name,e.cli,e.model||'-',e.role||'-'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td)});
    const td=document.createElement('td');const btn=document.createElement('button');btn.className='danger';btn.textContent='Del';
    btn.onclick=()=>delEmp(e.name);td.appendChild(btn);tr.appendChild(td);el.appendChild(tr);
  });
  const jl=document.getElementById('job-list');jl.innerHTML='';
  jobs.slice(0,20).forEach(j=>{
    const tr=document.createElement('tr');
    const idTd=document.createElement('td');idTd.style.fontFamily='monospace';idTd.style.fontSize='.8rem';idTd.textContent=j.id.slice(0,16);tr.appendChild(idTd);
    const cliTd=document.createElement('td');cliTd.textContent=j.cli;tr.appendChild(cliTd);
    const stTd=document.createElement('td');const badge=document.createElement('span');badge.className='badge '+j.status;badge.textContent=j.status;stTd.appendChild(badge);tr.appendChild(stTd);
    const phTd=document.createElement('td');phTd.textContent=j.phase||'-';tr.appendChild(phTd);
    const dtTd=document.createElement('td');dtTd.textContent=new Date(j.createdAt).toLocaleTimeString();tr.appendChild(dtTd);
    const actTd=document.createElement('td');const ib=document.createElement('button');ib.textContent='Inspect';ib.onclick=()=>inspectJob(j.id);actTd.appendChild(ib);tr.appendChild(actTd);
    jl.appendChild(tr);
  });
  if(quota.dailyLimit)document.getElementById('q-daily').value=quota.dailyLimit;
  if(quota.hourlyLimit)document.getElementById('q-hourly').value=quota.hourlyLimit;
}
async function addEmp(){
  const n=document.getElementById('emp-name').value.trim();if(!n)return;
  await fetch('/api/employees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,cli:document.getElementById('emp-cli').value,model:document.getElementById('emp-model').value||null,role:document.getElementById('emp-role').value||null})});
  document.getElementById('emp-name').value='';loadAll();
}
async function delEmp(name){await fetch('/api/employees/'+encodeURIComponent(name),{method:'DELETE'});loadAll()}
async function saveQuota(){
  await fetch('/api/quota',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({dailyLimit:parseInt(document.getElementById('q-daily').value)||0,hourlyLimit:parseInt(document.getElementById('q-hourly').value)||0})});
}
async function inspectJob(id){
  const data=await fetch('/api/jobs/'+encodeURIComponent(id)).then(r=>r.json());
  document.getElementById('job-detail').style.display='block';
  document.getElementById('job-detail-content').textContent=JSON.stringify(data,null,2);
}
loadAll();setInterval(loadAll,5000);
</script>
</body>
</html>`;
}
