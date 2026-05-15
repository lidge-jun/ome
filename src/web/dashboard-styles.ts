export function getDashboardStyles(): string {
    return `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;color:#1a1a1a;display:flex;min-height:100vh}

/* Sidebar */
.sidebar{width:280px;background:#fff;border-right:1px solid #e0e0e0;padding:20px;position:fixed;top:0;left:0;bottom:0;overflow-y:auto;display:flex;flex-direction:column;gap:20px}
.sidebar h1{font-size:1.3rem;font-weight:700;color:#1a1a1a;margin-bottom:4px}
.sidebar-section{border-top:1px solid #eee;padding-top:14px}
.sidebar-section h3{font-size:.75rem;text-transform:uppercase;color:#888;letter-spacing:.5px;margin-bottom:10px}

/* Status badge */
.status-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:16px;font-size:.85rem;font-weight:500}
.status-badge.running{background:#e8f5e9;color:#2e7d32}
.status-badge.idle{background:#f5f5f5;color:#666}
.status-badge::before{content:'';width:8px;height:8px;border-radius:50%}
.status-badge.running::before{background:#4caf50}
.status-badge.idle::before{background:#bbb}

/* Stats */
.stat-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:.9rem}
.stat-row .label{color:#666}
.stat-row .value{font-weight:600;color:#1a1a1a}

/* CLI Quota Cards */
.cli-quota-card{padding:10px;border:1px solid #e8e8e8;border-radius:8px;margin-bottom:8px;background:#fafafa}
.cli-quota-header{display:flex;align-items:center;gap:6px}
.cli-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.cli-dot.online{background:#4caf50}
.cli-dot.yellow{background:#f5a623}
.cli-dot.red{background:#e0e0e0}
.cli-svg{display:flex;align-items:center}
.cli-name{font-weight:600;font-size:.8rem}
.cli-account{font-size:.65rem;color:#888;margin:2px 0 3px 20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cli-auth-warn{font-size:.7rem;color:#e67e22;margin:3px 0 0 20px}
.cli-bars{margin-top:3px;padding-left:20px}
.cli-unavailable{text-align:center;color:#999;font-size:.8rem;padding:12px}

/* Quota window bars */
.quota-window{display:flex;align-items:center;gap:4px;margin:2px 0;font-size:.65rem}
.win-label{width:20px;text-align:right;color:#666;flex-shrink:0}
.win-bar{flex:1;height:5px;background:#eee;border-radius:3px;overflow:hidden}
.win-fill{height:100%;border-radius:3px;transition:width .3s}
.win-fill.ok{background:#4a9eff}
.win-fill.warn{background:#f5a623}
.win-fill.over{background:#e74c3c}
.win-pct{width:26px;text-align:right;color:#555;flex-shrink:0}
.win-reset{color:#aaa;font-size:.6rem;width:32px;text-align:right;flex-shrink:0}

/* Refresh */
.refresh-row{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:14px;border-top:1px solid #eee}
.refresh-btn{background:none;border:1px solid #ddd;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:.85rem;color:#555;display:flex;align-items:center;gap:4px}
.refresh-btn:hover{background:#f0f0f0}

/* Main */
.main{margin-left:280px;flex:1;padding:28px 32px}
.main-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
.main-header h2{font-size:1.1rem;font-weight:600;color:#1a1a1a;display:flex;align-items:center;gap:8px}
.help-icon{width:20px;height:20px;border-radius:50%;border:1px solid #ccc;display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;color:#999;cursor:help}
.add-btn{background:none;border:none;color:#888;cursor:pointer;font-size:.9rem;padding:6px 12px;border-radius:6px}
.add-btn:hover{background:#eee;color:#333}

/* Employee cards */
.emp-grid{display:flex;flex-direction:column;gap:16px;max-width:480px}
.emp-empty{text-align:center;color:#999;font-size:.9rem;padding:40px 20px;background:#fff;border:1px dashed #ddd;border-radius:12px;max-width:480px}
.emp-card{background:#fff;border:1px solid #e8e8e8;border-radius:12px;padding:20px;position:relative}
.emp-card-header{display:flex;align-items:center;gap:8px;margin-bottom:14px}
.emp-card-header .dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.emp-card-header .dot.idle{background:#4caf50}
.emp-card-header .dot.warn{background:#f5a623}
.emp-card-header .dot.busy{background:#ff9800}
.emp-cli-icon{display:flex;align-items:center}
.emp-card-header .name{font-weight:700;font-size:1rem;flex:1}
.emp-card-header .del-btn{background:none;border:none;color:#ccc;cursor:pointer;font-size:1.2rem;padding:2px 6px;line-height:1}
.emp-card-header .del-btn:hover{color:#e53935}

.field-row{display:flex;gap:12px;margin-bottom:10px}
.field{flex:1}
.field label{display:block;font-size:.7rem;color:#888;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px}
.field select,.field input{width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:.85rem;background:#fafafa;color:#1a1a1a;appearance:auto}
.field select:focus,.field input:focus{outline:none;border-color:#90caf9}

/* Jobs section */
.jobs-section{margin-top:36px;max-width:800px}
.jobs-section h2{font-size:1.1rem;font-weight:600;margin-bottom:16px;color:#1a1a1a}
.job-table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e8e8e8}
.job-table th{text-align:left;padding:10px 14px;font-size:.75rem;text-transform:uppercase;color:#888;background:#fafafa;border-bottom:1px solid #eee}
.job-table td{padding:10px 14px;font-size:.85rem;border-bottom:1px solid #f5f5f5}
.job-table tr:last-child td{border-bottom:none}
.job-badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.75rem;font-weight:500}
.job-badge.running{background:#e8f5e9;color:#2e7d32}
.job-badge.completed{background:#e3f2fd;color:#1565c0}
.job-badge.failed{background:#ffebee;color:#c62828}
.job-badge.cancelled{background:#fff8e1;color:#f57f17}
.job-badge.cancelling{background:#fff3e0;color:#e65100}
.inspect-btn{background:none;border:1px solid #ddd;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:.8rem;color:#555}
.inspect-btn:hover{background:#f0f0f0}

/* Add employee form */
.add-form{background:#fff;border:1px solid #e8e8e8;border-radius:12px;padding:20px;margin-bottom:16px;display:none;max-width:480px}
.add-form.open{display:block}
.add-form h3{font-size:.95rem;font-weight:600;margin-bottom:14px}
.add-error{color:#e53935;font-size:.8rem;margin-bottom:8px;min-height:1em}
.add-form .actions{display:flex;gap:8px;margin-top:14px}
.add-form .actions button{padding:8px 16px;border-radius:8px;font-size:.85rem;cursor:pointer}
.add-form .actions .primary{background:#1a1a1a;color:#fff;border:none}
.add-form .actions .primary:hover{background:#333}
.add-form .actions .cancel{background:none;border:1px solid #ddd;color:#555}
.add-form .actions .cancel:hover{background:#f5f5f5}

/* Save row */
.save-row{margin-top:10px;text-align:right}
.save-row.hidden{display:none}
.save-btn{background:#1a1a1a;color:#fff;border:none;padding:6px 16px;border-radius:6px;font-size:.85rem;cursor:pointer}
.save-btn:hover{background:#333}

/* Job detail */
#job-detail{display:none;margin-top:16px;padding:20px;background:#fff;border:1px solid #e8e8e8;border-radius:10px}
#job-detail h3{font-size:.95rem;font-weight:600;margin-bottom:10px}
#job-detail pre{white-space:pre-wrap;font-size:.8rem;max-height:400px;overflow:auto;background:#fafafa;padding:12px;border-radius:8px;border:1px solid #eee}

/* Toast */
#toast-container{position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px}
.toast{padding:10px 18px;border-radius:8px;font-size:.85rem;color:#fff;opacity:0;transform:translateX(40px);transition:opacity .3s,transform .3s;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.toast.show{opacity:1;transform:translateX(0)}
.toast-success{background:#2e7d32}
.toast-warn{background:#e65100}
.toast-error{background:#c62828}
`;
}
