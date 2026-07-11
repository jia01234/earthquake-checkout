// 地震災害救援裝備借用系統 - 主程式邏輯

// 全域狀態
let equipmentData = [];
let customMappings = {
  "監測": [],
  "骯髒破壞": [],
  "乾淨切割": [],
  "支撐": [],
  "其他": []
};

// 歷程紀錄狀態
let transactionLogs = [];

// 篩選與搜尋狀態
let activeFilterCategory = ""; // 當前篩選的地震工作類別 (監測, 骯髒破壞, 乾淨切割, 支撐, 其他)
let searchQuery = "";
let activeConfigCat = "監測"; // 設定面版中當前自訂對應的類別

// 歸還中箱子ID
let activeReturningBoxId = null;

// 1. 本地儲存讀寫 (LocalStorage)
function saveToStorage() {
  localStorage.setItem('earthquake_equipment_data', JSON.stringify(equipmentData));
}

function loadFromStorage() {
  const cached = localStorage.getItem('earthquake_equipment_data');
  if (cached) {
    try {
      equipmentData = JSON.parse(cached);
    } catch (e) {
      console.error("解析本地資料失敗，改用預設資料", e);
      equipmentData = JSON.parse(JSON.stringify(window.initialEquipmentData));
    }
  } else {
    // 首次開啟，載入 data.js 的預設資料
    equipmentData = JSON.parse(JSON.stringify(window.initialEquipmentData));
    saveToStorage();
  }

  // 載入交易日誌
  const cachedLogs = localStorage.getItem('earthquake_transaction_logs');
  if (cachedLogs) {
    try {
      transactionLogs = JSON.parse(cachedLogs);
    } catch (e) {
      console.error(e);
      transactionLogs = [];
    }
  }
}

// 2. 自訂任務推薦清單配置讀寫
function saveMappings() {
  localStorage.setItem('earthquake_custom_mappings', JSON.stringify(customMappings));
}

function loadMappings() {
  const cached = localStorage.getItem('earthquake_custom_mappings');
  if (cached) {
    try {
      customMappings = JSON.parse(cached);
    } catch (e) {
      console.error(e);
    }
  } else {
    // 預設配置：自動根據分類對應
    equipmentData.forEach(box => {
      box.categories.forEach(cat => {
        if (customMappings[cat] && !customMappings[cat].includes(box.boxId)) {
          customMappings[cat].push(box.boxId);
        }
      });
    });
    saveMappings();
  }
}

// 3. 新增歷程紀錄
function addTransactionLog(action, boxId, team, details = "") {
  const now = new Date();
  const timeStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  
  const logEntry = {
    timestamp: timeStr,
    action: action, // "borrow_a", "borrow_b", "return"
    boxId: boxId,
    team: team, // "A組", "B組", "--"
    details: details
  };

  transactionLogs.unshift(logEntry); // 最新的排在最前面
  if (transactionLogs.length > 1000) {
    transactionLogs.pop(); // 上限 1000 筆
  }

  localStorage.setItem('earthquake_transaction_logs', JSON.stringify(transactionLogs));
  renderLogs();
}

// 渲染歷程紀錄 Modal 內容
function renderLogs() {
  const container = document.getElementById('logListContainer');
  container.innerHTML = '';

  if (transactionLogs.length === 0) {
    container.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-secondary);">目前尚無任何借還歷史紀錄。</div>';
    return;
  }

  transactionLogs.forEach(log => {
    const item = document.createElement('div');
    item.className = 'log-item';

    let descClass = 'log-desc';
    let actionText = '';
    if (log.action === 'borrow_a') {
      descClass += ' borrow';
      actionText = `🔵 A組 借出 【${log.boxId}】`;
    } else if (log.action === 'borrow_b') {
      descClass += ' borrow';
      actionText = `🔴 B組 借出 【${log.boxId}】`;
    } else {
      descClass += log.details.includes('⚠️') ? ' issue' : ' return';
      actionText = `🟢 ${log.team ? log.team + ' ' : ''}歸還 【${log.boxId}】`;
    }

    item.innerHTML = `
      <div class="log-time">${log.timestamp}</div>
      <div class="${descClass}">${actionText} ${log.details ? `<span style="font-size: 0.85rem; opacity: 0.9;"><br>➔ ${log.details}</span>` : ''}</div>
    `;
    container.appendChild(item);
  });
}

// 匯出歷程紀錄 CSV
function exportLogsToCSV() {
  if (transactionLogs.length === 0) {
    showToast("❌ 沒有可匯出的紀錄！");
    return;
  }

  let csvContent = "\uFEFF時間,動作,箱號,組別,詳細說明\n";
  transactionLogs.forEach(log => {
    let actionStr = "";
    if (log.action === 'borrow_a') actionStr = "借出";
    else if (log.action === 'borrow_b') actionStr = "借出";
    else actionStr = "歸還";

    const detailsEscaped = log.details.replace(/"/g, '""');
    csvContent += `"${log.timestamp}","${actionStr}","${log.boxId}","${log.team}","${detailsEscaped}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `地震救援裝備借還歷程_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("📤 歷程 CSV 檔匯出成功！");
}

// 清除歷程紀錄
function clearLogs() {
  if (confirm("⚠️ 確定要清除所有借還歷程紀錄嗎？此動作無法復原。")) {
    transactionLogs = [];
    localStorage.removeItem('earthquake_transaction_logs');
    renderLogs();
    showToast("🗑️ 歷程紀錄已全數清空");
  }
}

// 4. 戰情統計卡片數據更新
function updateStats() {
  const total = equipmentData.length;
  const avail = equipmentData.filter(b => b.status === 'available').length;
  const ta = equipmentData.filter(b => b.status === 'teamA').length;
  const tb = equipmentData.filter(b => b.status === 'teamB').length;

  document.getElementById('statTotalBoxes').innerText = total;
  document.getElementById('statAvailBoxes').innerText = avail;
  document.getElementById('statTaBoxes').innerText = ta;
  document.getElementById('statTbBoxes').innerText = tb;
}

// 5. 渲染首頁主裝備卡片區
function renderEquipment() {
  const grid = document.getElementById('equipmentGrid');
  grid.innerHTML = '';

  // 1. 取得需要篩選的推薦箱子名單
  let recommendedBoxIds = null;
  if (activeFilterCategory) {
    recommendedBoxIds = customMappings[activeFilterCategory] || [];
  }

  // 2. 進行模糊搜尋與篩選過濾
  const filtered = equipmentData.filter(box => {
    // 類別過濾 (自訂推薦清單篩選)
    if (recommendedBoxIds !== null) {
      if (!recommendedBoxIds.includes(box.boxId)) return false;
    }

    // 關鍵字搜尋 (模糊搜尋箱號、組別、存放位置或箱內所有裝備的品名/規格)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchBoxId = box.boxId.toLowerCase().includes(q);
      const matchGroup = box.group.toLowerCase().includes(q);
      const matchLoc = (box.location || "").toLowerCase().includes(q);
      
      const matchItems = box.items.some(item => 
        item.name.toLowerCase().includes(q) || 
        (item.spec && item.spec.toLowerCase().includes(q))
      );

      return matchBoxId || matchGroup || matchLoc || matchItems;
    }

    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-secondary);">
        <p style="font-size: 1.2rem; margin-bottom: 8px;">🔍 沒有找到符合條件的裝備箱</p>
        <p style="font-size: 0.9rem;">試試更換搜尋關鍵字，或清除上方的救援工作篩選按鈕。</p>
      </div>
    `;
    return;
  }

  filtered.forEach(box => {
    const card = document.createElement('div');
    
    // 如果有異常回報，加入 has-issue 樣式
    const hasIssue = box.hasDamageOrMissing === true;
    card.className = `box-card ${box.status} ${hasIssue ? 'has-issue' : ''}`;
    
    // 計算箱子主狀態文字與類別徽章
    let statusBadge = '';
    let actionButtons = '';
    
    if (box.status === 'available') {
      statusBadge = '<span class="status-badge available">🟢 在庫</span>';
      actionButtons = `
        <button class="btn btn-borrow btn-borrow-ta" onclick="event.stopPropagation(); borrowBox('${box.boxId}', 'A組')">借出 A組</button>
        <button class="btn btn-borrow btn-borrow-tb" onclick="event.stopPropagation(); borrowBox('${box.boxId}', 'B組')">借出 B組</button>
      `;
    } else {
      const isTeamA = box.status === 'teamA';
      const teamText = isTeamA ? '🔵 A組借用' : '🔴 B組借用';
      const teamClass = isTeamA ? 'teama' : 'teamb';
      
      statusBadge = `<span class="status-badge ${teamClass}">${teamText}</span>`;
      actionButtons = `
        <button class="btn btn-return" onclick="event.stopPropagation(); openReturnModal('${box.boxId}')">🟢 歸還登記</button>
      `;
    }

    // 器材缺失標籤
    let issueTag = '';
    if (hasIssue) {
      issueTag = `
        <div class="issue-indicator" title="缺失明細">
          ⚠️ 缺漏/損壞
        </div>
      `;
    }

    // 箱內裝備項目預覽 (最多顯示 3 樣，其餘以 ... 替代)
    const previewItems = box.items.slice(0, 3);
    let previewHtml = previewItems.map(item => `
      <div class="item-preview-row">
        <span class="preview-name">${item.name}</span>
        <span class="preview-qty">${item.qty}</span>
      </div>
    `).join('');
    
    if (box.items.length > 3) {
      previewHtml += `
        <div style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; margin-top: 4px;">
          ... 及其他 ${box.items.length - 3} 項器材
        </div>
      `;
    }

    card.innerHTML = `
      <div onclick="openDetailModal('${box.boxId}')" style="height: 100%; display: flex; flex-direction: column; justify-content: space-between; cursor: pointer;">
        <div>
          <!-- 卡片頂部狀態與缺失 -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            ${statusBadge}
            ${issueTag}
          </div>
          
          <!-- 箱號與存放位置 -->
          <h3 class="box-title">${box.boxId}</h3>
          <div class="box-meta-row">
            <span>分組: ${box.group}</span>
            <span>📍 ${box.location || '未標註'}</span>
          </div>

          <!-- 借出資訊 -->
          ${box.borrowedBy ? `
            <div style="font-size: 0.8rem; background: rgba(255,255,255,0.04); border-radius: 6px; padding: 6px 8px; margin: 8px 0; border-left: 3px solid ${box.status === 'teamA' ? 'var(--status-teama)' : 'var(--status-teamb)'};">
              👤 ${box.borrowedBy} • 🕒 ${box.borrowedTime}
            </div>
          ` : ''}

          <!-- 裝備預覽區 -->
          <div class="box-preview-container">
            ${previewHtml}
          </div>
        </div>

        <!-- 底部大觸控借還鍵 -->
        <div class="box-actions-grid" style="margin-top: 15px;">
          ${actionButtons}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// 6. 租借操作
function borrowBox(boxId, teamName) {
  const box = equipmentData.find(b => b.boxId === boxId);
  if (!box) return;

  const now = new Date();
  const timeStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  box.status = teamName === 'A組' ? 'teamA' : 'teamB';
  box.borrowedBy = teamName;
  box.borrowedTime = timeStr;

  saveToStorage();
  updateStats();
  renderEquipment();
  
  // 記錄日誌
  addTransactionLog(teamName === 'A組' ? 'borrow_a' : 'borrow_b', boxId, teamName);
  
  showToast(`🔵 【${boxId}】已成功借出給【${teamName}】`);
}

// 7. 開啟歸還確認 Modal (包含損壞/缺漏勾選)
function openReturnModal(boxId) {
  const box = equipmentData.find(b => b.boxId === boxId);
  if (!box) return;

  activeReturningBoxId = boxId;
  document.getElementById('returnModalTitle').innerText = `確認歸還裝備箱：${boxId}`;
  
  const tbody = document.getElementById('returnModalItemTableBody');
  tbody.innerHTML = '';

  // 避免事件傳播造成彈窗立刻關閉
  tbody.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 動態建立清單項目，附帶加減數量與損壞複選框
  box.items.forEach((item, index) => {
    const totalQty = parseInt(item.qty) || 1;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="item-row-name">${item.name}</td>
      <td style="text-align: center; font-weight: 700;">${item.qty}</td>
      <td style="text-align: center;">
        <div class="return-qty-control" style="justify-content: center;">
          <button class="btn-qty" onclick="changeMissingQty(event, ${index}, -1, ${totalQty})">-</button>
          <span class="qty-val" id="missingVal_${index}" data-max="${totalQty}">0</span>
          <button class="btn-qty" onclick="changeMissingQty(event, ${index}, 1, ${totalQty})">+</button>
        </div>
      </td>
      <td style="text-align: center;">
        <input type="checkbox" class="damage-checkbox" id="damageCheck_${index}" onclick="event.stopPropagation()">
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('returnModal').classList.add('active');
}

// 調整缺失數量，不可超過原本總數，也不可小於 0
function changeMissingQty(event, index, delta, max) {
  event.stopPropagation();
  const el = document.getElementById(`missingVal_${index}`);
  let val = parseInt(el.innerText) + delta;
  if (val < 0) val = 0;
  if (val > max) val = max;
  el.innerText = val;
  
  // 如果有缺失，文字加亮警告色
  if (val > 0) {
    el.classList.add('warning');
  } else {
    el.classList.remove('warning');
  }
}

// 點選確認歸還，處理並記錄損壞與缺少明細
function confirmReturn() {
  if (!activeReturningBoxId) return;

  const box = equipmentData.find(b => b.boxId === activeReturningBoxId);
  if (!box) return;

  const formerTeam = box.borrowedBy; // 原本借用的組別

  // 解析使用者在畫面上輸入的缺漏與損壞狀態
  const anomalyItems = [];
  box.items.forEach((item, index) => {
    const missingCount = parseInt(document.getElementById(`missingVal_${index}`).innerText) || 0;
    const isDamaged = document.getElementById(`damageCheck_${index}`).checked;

    if (missingCount > 0 || isDamaged) {
      anomalyItems.push({
        name: item.name,
        missing: missingCount,
        damaged: isDamaged,
        origQty: item.qty
      });
    }
  });

  // 更新箱子狀態
  box.status = 'available';
  box.borrowedBy = '';
  box.borrowedTime = '';

  let logDetails = "";
  if (anomalyItems.length > 0) {
    box.hasDamageOrMissing = true;
    box.damagedItems = anomalyItems;
    
    // 串接詳細日誌字串
    const summary = anomalyItems.map(a => {
      let str = a.name;
      if (a.missing > 0) str += `(缺 ${a.missing})`;
      if (a.damaged) str += `(損壞)`;
      return str;
    }).join(', ');
    
    logDetails = `⚠️ 歸還異常：${summary}`;
  } else {
    box.hasDamageOrMissing = false;
    box.damagedItems = [];
    logDetails = "正常歸還";
  }

  saveToStorage();
  updateStats();
  renderEquipment();
  
  // 記錄日誌
  addTransactionLog("return", activeReturningBoxId, formerTeam, logDetails);

  document.getElementById('returnModal').classList.remove('active');
  
  if (box.hasDamageOrMissing) {
    showToast(`⚠️ 【${activeReturningBoxId}】已歸還，但有缺失回報！`);
  } else {
    showToast(`🟢 已成功歸還【${activeReturningBoxId}】`);
  }
  
  activeReturningBoxId = null;
}

// 8. 裝備單箱詳情 Modal (支援顯示缺失詳情)
function openDetailModal(boxId) {
  const box = equipmentData.find(b => b.boxId === boxId);
  if (!box) return;

  document.getElementById('modalBoxId').innerText = `📦 裝備箱：${box.boxId}`;
  document.getElementById('modalGroup').innerText = box.group;
  document.getElementById('modalLocation').innerText = box.location || '未標註';

  const tbody = document.getElementById('modalItemTableBody');
  tbody.innerHTML = '';

  // 如果這箱有缺失紀錄，在最上方插入醒目黃色標示
  if (box.hasDamageOrMissing && box.damagedItems && box.damagedItems.length > 0) {
    const trWarn = document.createElement('tr');
    trWarn.style.background = 'rgba(245, 158, 11, 0.1)';
    
    const summaryList = box.damagedItems.map(a => {
      let parts = [];
      if (a.missing > 0) parts.push(`缺失數量: ${a.missing}/${a.origQty}`);
      if (a.damaged) parts.push("硬體受損/故障");
      return `【${a.name}】(${parts.join(', ')})`;
    }).join('、');

    trWarn.innerHTML = `
      <td colspan="5" style="color: #fbbf24; font-weight: 700; padding: 12px; border-bottom: 2px solid rgba(245, 158, 11, 0.3);">
        ⚠️ 本箱目前存在以下異常回報：<br>${summaryList}
      </td>
    `;
    tbody.appendChild(trWarn);
  }

  box.items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="item-row-name">${item.name}</td>
      <td class="item-row-qty">${item.qty}</td>
      <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${item.spec || '--'}</span></td>
      <td>
        <span style="font-size: 0.85rem; color: var(--text-secondary);">
          ${item.power ? `⚡ ${item.power}` : ''}
          ${item.consumable ? `<br>🧪 耗材: ${item.consumable}` : ''}
          ${(!item.power && !item.consumable) ? '--' : ''}
        </span>
      </td>
      <td><span class="item-row-tag">${item.category}</span></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('detailModal').classList.add('active');
}

// 9. A組/B組目前借用總明細 Modal
function openTeamModal(teamName) {
  const teamStatus = teamName === 'A組' ? 'teamA' : 'teamB';
  const borrowedBoxes = equipmentData.filter(b => b.status === teamStatus);

  document.getElementById('teamModalTitle').innerText = `📋 ${teamName} 目前借用總明細`;
  const tbody = document.getElementById('teamModalItemTableBody');
  tbody.innerHTML = '';

  if (borrowedBoxes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 40px 0;">
          目前此小組尚未借用任何裝備箱。
        </td>
      </tr>
    `;
  } else {
    borrowedBoxes.forEach(box => {
      box.items.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <!-- 只有第一行顯示箱號與位置，方便閱讀 -->
          ${index === 0 ? `<td rowspan="${box.items.length}" style="font-weight: 800; color: #fff; vertical-align: top; border-right: 1px solid var(--border-light);">${box.boxId}</td>` : ''}
          ${index === 0 ? `<td rowspan="${box.items.length}" style="vertical-align: top; color: var(--text-secondary); border-right: 1px solid var(--border-light);">${box.location || '--'}</td>` : ''}
          <td class="item-row-name">${item.name}</td>
          <td class="item-row-qty">${item.qty}</td>
          <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${item.spec || '--'}</span></td>
          <td>
            <span style="font-size: 0.85rem; color: var(--text-secondary);">
              ${item.power ? `⚡ ${item.power}` : ''}
              ${item.consumable ? `🧪 ${item.consumable}` : ''}
              ${(!item.power && !item.consumable) ? '--' : ''}
            </span>
          </td>
        `;
        tbody.appendChild(tr);
      });
    });
  }

  document.getElementById('teamModal').classList.add('active');
}

// 10. 自訂任務推薦箱子配置渲染與切換
function renderConfigGrid() {
  const grid = document.getElementById('configBoxGrid');
  grid.innerHTML = '';

  // 列出所有箱子名稱 (不重覆)
  const allBoxIds = equipmentData.map(b => b.boxId);
  
  allBoxIds.forEach(boxId => {
    const isChecked = customMappings[activeConfigCat] && customMappings[activeConfigCat].includes(boxId);
    
    const label = document.createElement('label');
    label.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      padding: 6px 8px;
      background: ${isChecked ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.04)'};
      border: 1px solid ${isChecked ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-light)'};
      border-radius: 8px;
      cursor: pointer;
      user-select: none;
      transition: all 0.2s;
    `;
    
    label.innerHTML = `
      <input type="checkbox" style="accent-color: var(--accent)" ${isChecked ? 'checked' : ''} onchange="toggleBoxMapping('${boxId}', this.checked, this)">
      <span style="color: ${isChecked ? '#fff' : 'var(--text-secondary)'}; font-weight: ${isChecked ? '700' : 'normal'}">${boxId}</span>
    `;
    
    grid.appendChild(label);
  });
}

function toggleBoxMapping(boxId, isChecked, checkboxEl) {
  if (!customMappings[activeConfigCat]) {
    customMappings[activeConfigCat] = [];
  }

  const index = customMappings[activeConfigCat].indexOf(boxId);
  if (isChecked) {
    if (index === -1) {
      customMappings[activeConfigCat].push(boxId);
    }
  } else {
    if (index !== -1) {
      customMappings[activeConfigCat].splice(index, 1);
    }
  }

  saveMappings();
  
  const label = checkboxEl.parentElement;
  if (isChecked) {
    label.style.background = 'rgba(99, 102, 241, 0.15)';
    label.style.borderColor = 'rgba(99, 102, 241, 0.4)';
    label.querySelector('span').style.color = '#fff';
    label.querySelector('span').style.fontWeight = '700';
  } else {
    label.style.background = 'rgba(255,255,255,0.04)';
    label.style.borderColor = 'var(--border-light)';
    label.querySelector('span').style.color = 'var(--text-secondary)';
    label.querySelector('span').style.fontWeight = 'normal';
  }

  renderEquipment();
}

// CSV 解析器 (支援引號與換行)
function parseCSV(text) {
  let lines = [];
  let row = [""];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    let next = text[i+1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push("");
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') { i++; }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
}

// 核心：解析裝備頁數據 (二維陣列) 的欄位與資料列
function parseSheetRows(parsedRows, sheetName, allEqRows, logDiv) {
  if (parsedRows.length === 0) return;

  // 尋找表頭列，藉此動態判斷欄位索引 (防止使用者新增/移動欄位，自動對應 B 欄箱號)
  let headerRow = null;
  let headerRowIndex = -1;

  for (let i = 0; i < parsedRows.length; i++) {
    const r = parsedRows[i];
    if (!r || r.length < 2) continue;
    const rowStr = r.map(c => c ? c.toString().trim() : "").join("|");
    
    if (rowStr.includes("組別") && (rowStr.includes("團體裝備") || rowStr.includes("品名"))) {
      headerRow = r.map(c => c ? c.toString().trim() : "");
      headerRowIndex = i;
      break;
    }
  }

  if (!headerRow) {
    logDiv.innerHTML += `<span style="color: #f59e0b;">⚠️ 忽略分頁【${sheetName}】: 未找到「組別」與「團體裝備/品名」表頭</span><br>`;
    return;
  }

  // 動態匹配關鍵字對應的索引值
  let colGroupIdx = headerRow.findIndex(c => c.includes("組別"));
  let colNameIdx = headerRow.findIndex(c => c.includes("團體裝備") || c.includes("品名") || c.includes("品項"));
  let colQtyIdx = headerRow.findIndex(c => c.includes("數量"));
  let colBoxIdx = headerRow.findIndex(c => c.includes("箱號") || c.includes("箱子"));
  let colSpecIdx = headerRow.findIndex(c => c.includes("規格") || c.includes("序號"));
  let colPowerIdx = headerRow.findIndex(c => c.includes("動力"));
  let colConsumableIdx = headerRow.findIndex(c => c.includes("耗材"));
  let colWeightIdx = headerRow.findIndex(c => c.includes("重量"));
  let colLocationIdx = headerRow.findIndex(c => c.includes("位置") || c.includes("存放"));

  // 容錯機制 (當某些選填欄位未配對到時，使用預設舊版欄位順序)
  if (colGroupIdx === -1) colGroupIdx = 0;
  if (colNameIdx === -1) colNameIdx = 1;
  if (colQtyIdx === -1) colQtyIdx = 2;
  
  // 💡 智慧匹配 Column B (index 1)：如果沒有配對到 colBoxIdx，或者配對到 7 (預設)，
  // 但 Column B 在接下來的資料行中具有高頻率的值，我們自動將其設置為箱號欄！
  if (colBoxIdx === -1 || colBoxIdx === 7) {
    let hasValInColB = false;
    let sampleCount = 0;
    for (let i = headerRowIndex + 1; i < Math.min(parsedRows.length, headerRowIndex + 15); i++) {
      if (parsedRows[i] && parsedRows[i][1]) {
        const valB = parsedRows[i][1].toString().trim();
        // 排除當 colB 剛好與品名欄相同的情況
        if (valB && valB !== (parsedRows[i][colNameIdx] ? parsedRows[i][colNameIdx].toString().trim() : "")) {
          hasValInColB = true;
          sampleCount++;
        }
      }
    }
    if (hasValInColB && sampleCount > 2) {
      colBoxIdx = 1;
    } else {
      if (colBoxIdx === -1) colBoxIdx = 7; // 預設第 8 欄
    }
  }

  if (colSpecIdx === -1) colSpecIdx = 4;
  if (colPowerIdx === -1) colPowerIdx = 5;
  if (colConsumableIdx === -1) colConsumableIdx = 6;
  if (colWeightIdx === -1) colWeightIdx = 9;
  if (colLocationIdx === -1) colLocationIdx = 11;
  let sheetCount = 0;
  for (let i = headerRowIndex + 1; i < parsedRows.length; i++) {
    const r = parsedRows[i];
    if (!r || r.length === 0) continue;

    const c0 = r[colGroupIdx] ? r[colGroupIdx].toString().trim() : "";
    const c1 = r[colNameIdx] ? r[colNameIdx].toString().trim() : "";

    // 偵測數據表終止行
    if (c0 === "序號" || c0.includes("合計") || (c0 === "1" && c1.includes("箱"))) {
      break;
    }

    allEqRows.push({
      row: r,
      sheetName,
      colGroupIdx, colNameIdx, colQtyIdx, colBoxIdx, colSpecIdx, colPowerIdx, colConsumableIdx, colWeightIdx, colLocationIdx
    });
    sheetCount++;
  }
  logDiv.innerHTML += `分頁【${sheetName}】: 成功載入 ${sheetCount} 條裝備。<br>`;
}

// 核心：處理已經二維標準化的資料，合併分箱分組
function importParsedRows(allEqRows, logDiv) {
  logDiv.innerHTML += `開始合併分箱分組...<br>`;

  // 暫存現有的借用與異常狀態，避免覆蓋
  const oldStatusMap = {};
  equipmentData.forEach(b => {
    oldStatusMap[b.boxId] = {
      status: b.status,
      borrowedBy: b.borrowedBy,
      borrowedTime: b.borrowedTime,
      hasDamageOrMissing: b.hasDamageOrMissing,
      damagedItems: b.damagedItems
    };
  });

  // 進行分箱分組
  const tempBoxes = {};
  let currentGroup = "未分類";
  let lastBox = "";

  allEqRows.forEach(({ row: r, colGroupIdx, colNameIdx, colQtyIdx, colBoxIdx, colSpecIdx, colPowerIdx, colConsumableIdx, colWeightIdx, colLocationIdx }) => {
    const groupVal = r[colGroupIdx] ? r[colGroupIdx].toString().trim().replace(/\n/g, '') : '';
    if (groupVal) {
      currentGroup = groupVal;
      lastBox = ""; // 更換組別時重置
    }

    const itemName = r[colNameIdx] ? r[colNameIdx].toString().trim() : '';
    if (!itemName) return;

    const qty = r[colQtyIdx] ? r[colQtyIdx].toString().trim() : '';
    const spec = r[colSpecIdx] ? r[colSpecIdx].toString().trim() : '';
    const power = r[colPowerIdx] ? r[colPowerIdx].toString().trim() : '';
    const consumable = r[colConsumableIdx] ? r[colConsumableIdx].toString().trim() : '';
    const boxNo = r[colBoxIdx] ? r[colBoxIdx].toString().trim().replace(/\n/g, ' ') : '';
    const weight = r[colWeightIdx] ? r[colWeightIdx].toString().trim() : '';
    const location = r[colLocationIdx] ? r[colLocationIdx].toString().trim() : '';

    // 合併單元格向上填滿與位置敏感判定邏輯
    let boxKey = "";
    if (boxNo) {
      lastBox = boxNo;
      boxKey = boxNo;
    } else {
      if (lastBox && !location) {
        boxKey = lastBox;
      } else {
        lastBox = "";
        boxKey = `${currentGroup}無箱號`;
      }
    }

    if (!tempBoxes[boxKey]) {
      tempBoxes[boxKey] = {
        boxId: boxKey,
        group: currentGroup,
        location: location,
        items: [],
        categories: new Set()
      };
    }

    // 智能地震工作情境分類
    const itemCat = classifyItem(itemName, currentGroup);
    tempBoxes[boxKey].categories.add(itemCat);

    tempBoxes[boxKey].items.push({
      name: itemName,
      qty: qty,
      spec: spec,
      power: power,
      consumable: consumable,
      weight: weight,
      category: itemCat
    });
  });

  // 格式化最終數據
  const newEquipmentData = [];
  for (const [key, bData] of Object.entries(tempBoxes)) {
    const categoriesArray = Array.from(bData.categories);
    
    let primaryCat = "其他";
    if (bData.categories.has("監測")) primaryCat = "監測";
    else if (bData.categories.has("支撐")) primaryCat = "支撐";
    else if (bData.categories.has("骯髒破壞")) primaryCat = "骯髒破壞";
    else if (bData.categories.has("乾淨切割")) primaryCat = "乾淨切割";

    if (categoriesArray.length > 1 && bData.categories.has("其他")) {
      bData.categories.delete("其他");
    }

    // 還原借用狀態與損壞備註
    let status = "available";
    let borrowedBy = "";
    let borrowedTime = "";
    let hasDamageOrMissing = false;
    let damagedItems = [];

    if (oldStatusMap[key]) {
      status = oldStatusMap[key].status;
      borrowedBy = oldStatusMap[key].borrowedBy;
      borrowedTime = oldStatusMap[key].borrowedTime;
      hasDamageOrMissing = oldStatusMap[key].hasDamageOrMissing || false;
      damagedItems = oldStatusMap[key].damagedItems || [];
    }

    newEquipmentData.push({
      boxId: bData.boxId,
      group: bData.group,
      location: bData.location,
      primaryCategory: primaryCat,
      categories: Array.from(bData.categories),
      items: bData.items,
      status: status,
      borrowedBy: borrowedBy,
      borrowedTime: borrowedTime,
      hasDamageOrMissing: hasDamageOrMissing,
      damagedItems: damagedItems
    });
  }

  // 依據名稱排序
  newEquipmentData.sort((a, b) => a.boxId.localeCompare(b.boxId, 'zh-hant'));

  // 更新並儲存
  equipmentData = newEquipmentData;
  saveToStorage();

  // 更新自訂分類推薦對應
  const newMappings = { ...customMappings };
  equipmentData.forEach(box => {
    box.categories.forEach(cat => {
      if (newMappings[cat]) {
        const existsInAnyCat = Object.values(newMappings).some(list => list.includes(box.boxId));
        if (!existsInAnyCat) {
          newMappings[cat].push(box.boxId);
        }
      }
    });
  });
  customMappings = newMappings;
  saveMappings();

  updateStats();
  renderConfigGrid();
  renderEquipment();

  logDiv.innerHTML += `<span style="color: #10b981; font-weight: 700;">✅ 同步與合併成功！共整理出 ${equipmentData.length} 個裝備箱。</span><br>`;
  showToast('🔄 雲端裝備同步成功！');

  setTimeout(() => {
    document.getElementById('settingsModal').classList.remove('active');
    logDiv.style.display = 'none';
  }, 1800);

// 處理本機載入 Excel 工作簿
function processWorkbook(workbook, logDiv) {
  let allEqRows = [];
  logDiv.innerHTML += `成功讀取 Excel！共發現 ${workbook.SheetNames.length} 個分頁。<br>`;
  
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    
    // 💡 預先填滿 Excel 中所有垂直/水平合併的儲存格
    if (worksheet['!merges']) {
      worksheet['!merges'].forEach(merge => {
        const startRef = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
        const val = worksheet[startRef];
        if (val !== undefined) {
          for (let r = merge.s.r; r <= merge.e.r; r++) {
            for (let c = merge.s.c; c <= merge.e.c; c++) {
              if (r === merge.s.r && c === merge.s.c) continue;
              const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
              worksheet[cellRef] = { ...val };
            }
          }
        }
      });
    }

    const parsedRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    parseSheetRows(parsedRows, sheetName, allEqRows, logDiv);
  });
  
  if (allEqRows.length === 0) {
    logDiv.innerHTML += `<span style="color: #ef4444;">❌ 找不到任何有效的裝備明細資料！請確認檔案內容格式。</span><br>`;
    return;
  }
  
  importParsedRows(allEqRows, logDiv);
}

// 11. 雲端同步邏輯：從 Google 試算表 (藉由 CSV 格式繞過瀏覽器 CORS 的 XLSX 下載限制)
async function syncFromGoogleSheets(input) {
  const logDiv = document.getElementById('syncLog');
  logDiv.style.display = 'block';
  logDiv.innerHTML = '正在分析試算表連結...<br>';

  // 1. 擷取 Spreadsheet ID
  let sheetId = input.trim();
  if (sheetId.includes('docs.google.com/spreadsheets')) {
    const matches = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (matches && matches[1]) {
      sheetId = matches[1];
    } else {
      logDiv.innerHTML += '<span style="color: #ef4444;">❌ 無法識別的 Google Sheets 網址</span><br>';
      return;
    }
  }

  // 2. 獲取要同步的分頁名稱
  const sheetNamesText = document.getElementById('sheetNamesInput').value.trim();
  const sheetNames = sheetNamesText ? sheetNamesText.split(',').map(s => s.trim()).filter(s => s) : [];

  let allEqRows = [];

  try {
    if (sheetNames.length === 0) {
      // 預設模式：抓取第一頁 (CSV 支援 CORS 下載)
      logDiv.innerHTML += `準備下載預設 CSV (第一分頁)...<br>`;
      const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      
      const response = await fetch(exportUrl);
      if (!response.ok) {
        throw new Error(`HTTP 錯誤狀態: ${response.status}。請確認試算表已開啟「知道連結的任何人均可檢視」分享權限。`);
      }
      
      const csvText = await response.text();
      const parsedRows = parseCSV(csvText);
      parseSheetRows(parsedRows, "預設第一頁", allEqRows, logDiv);
    } else {
      // 多分頁模式：逐頁下載 CSV (CSV 支援 CORS，可帶 sheet 參數抓取特定分頁)
      logDiv.innerHTML += `準備下載分頁：${sheetNames.join(', ')}...<br>`;
      
      for (const sheetName of sheetNames) {
        logDiv.innerHTML += `下載分頁【${sheetName}】中...<br>`;
        const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&sheet=${encodeURIComponent(sheetName)}`;
        
        const response = await fetch(exportUrl);
        if (!response.ok) {
          throw new Error(`無法下載分頁【${sheetName}】。請確認分頁名稱完全正確，且試算表已分享。`);
        }
        
        const csvText = await response.text();
        const parsedRows = parseCSV(csvText);
        parseSheetRows(parsedRows, sheetName, allEqRows, logDiv);
      }
    }

    if (allEqRows.length === 0) {
      throw new Error("找不到任何有效的裝備明細！");
    }

    importParsedRows(allEqRows, logDiv);

  } catch (error) {
    console.error(error);
    logDiv.innerHTML += `<span style="color: #ef4444;">❌ 同步失敗：<br>${error.message}</span><br>`;
  }
}

// 12. 智能地震分類邏輯
function classifyItem(name, group) {
  const nameL = name.toLowerCase();
  
  // 1. 監測 (Monitoring / Search)
  const monitorKws = ["偵測", "探測", "感應", "熱像儀", "無人機", "相機", "顯示器", "螢幕", "雷達", "聲納", "餘震", "無線電", "中繼", "gps", "通訊", "對講機"];
  if (group === "搜索組" || monitorKws.some(kw => nameL.includes(kw))) {
    return "監測";
  }
  
  // 2. 支撐 (Shoring / Lifting)
  const shoringKws = ["支撐", "頂舉", "腳架", "氣墊", "千斤頂", "滑輪", "繩", "吊帶", "掛勾", "鉤", "板", "木", "楔", "滑車", "吊車"];
  if (shoringKws.some(kw => nameL.includes(kw))) {
    return "支撐";
  }
  
  // 3. 骯髒破壞 (Dirty breaching / heavy rescue)
  const dirtyKws = ["破壞", "錘", "鑿", "鎚", "鎬", "鑽", "撬", "斧", "鏈鋸", "鍊鋸", "鏈砂", "砂輪", "破碎", "重力", "撬棍", "大錘", "衝擊"];
  if (dirtyKws.some(kw => nameL.includes(kw))) {
    return "骯髒破壞";
  }

  // 4. 乾淨切割 (Clean cutting / light rescue)
  const cleanKws = ["切割", "鋸", "剪", "刀", "鋼筋", "金屬切割"];
  if (cleanKws.some(kw => nameL.includes(kw))) {
    return "乾淨切割";
  }

  return "其他";
}

// 13. Toast 提示
function showToast(message) {
  const toast = document.getElementById('toastMessage');
  toast.innerText = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// 14. 綁定事件監聽器
window.addEventListener('DOMContentLoaded', () => {
  // 載入資料
  loadFromStorage();
  loadMappings();
  renderLogs();
  
  // 初始繪製
  updateStats();
  renderConfigGrid();
  renderEquipment();

  // 搜尋欄監聽
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderEquipment();
  });

  // 設定視窗開關
  document.getElementById('btnOpenSettings').addEventListener('click', () => {
    const cachedUrl = localStorage.getItem('sheetUrlInput') || '';
    document.getElementById('sheetUrlInput').value = cachedUrl;
    const cachedNames = localStorage.getItem('sheetNamesInput') || '';
    document.getElementById('sheetNamesInput').value = cachedNames;
    document.getElementById('settingsModal').classList.add('active');
  });
  
  document.getElementById('btnCloseSettings').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('active');
  });

  // 歷程紀錄視窗開關
  document.getElementById('btnOpenLogs').addEventListener('click', () => {
    renderLogs();
    document.getElementById('logModal').classList.add('active');
  });

  document.getElementById('btnCloseLogModal').addEventListener('click', () => {
    document.getElementById('logModal').classList.remove('active');
  });

  document.getElementById('btnExportLogCsv').addEventListener('click', exportLogsToCSV);
  document.getElementById('btnClearLog').addEventListener('click', clearLogs);

  // 歸還視窗按鈕
  document.getElementById('btnConfirmReturn').addEventListener('click', confirmReturn);
  document.getElementById('btnCancelReturn').addEventListener('click', () => {
    document.getElementById('returnModal').classList.remove('active');
    activeReturningBoxId = null;
  });
  document.getElementById('btnCloseReturnModal').addEventListener('click', () => {
    document.getElementById('returnModal').classList.remove('active');
    activeReturningBoxId = null;
  });

  // 同步按鈕
  document.getElementById('btnStartSync').addEventListener('click', () => {
    const url = document.getElementById('sheetUrlInput').value;
    const names = document.getElementById('sheetNamesInput').value;
    localStorage.setItem('sheetUrlInput', url);
    localStorage.setItem('sheetNamesInput', names);
    syncFromGoogleSheets(url);
  });

  // 本地導入按鈕與檔案讀取
  document.getElementById('excelFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    document.getElementById('fileUploadName').innerText = `📄 已選擇：${file.name}`;
    
    const logDiv = document.getElementById('syncLog');
    logDiv.style.display = 'block';
    logDiv.innerHTML = `正在解析本地檔案 ${file.name}...<br>`;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        processWorkbook(workbook, logDiv);
      } catch(err) {
        logDiv.innerHTML += `<span style="color: #ef4444;">❌ 本地解析失敗: ${err.message}</span><br>`;
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // 重置按鈕
  document.getElementById('btnResetLocalData').addEventListener('click', () => {
    if (confirm("⚠️ 確定要將裝備重置為預設資料嗎？這將會清除您目前所有的借還狀態與雲端同步資料。")) {
      localStorage.removeItem('earthquake_equipment_data');
      localStorage.removeItem('earthquake_custom_mappings');
      localStorage.removeItem('earthquake_transaction_logs');
      localStorage.removeItem('sheetUrlInput');
      localStorage.removeItem('sheetNamesInput');
      
      // 重新載入
      loadFromStorage();
      loadMappings();
      transactionLogs = [];
      renderLogs();
      updateStats();
      renderConfigGrid();
      renderEquipment();
      showToast("⚠️ 已重置為初始預設資料庫！");
      document.getElementById('settingsModal').classList.remove('active');
    }
  });

  // 詳情 Modal 關閉
  document.getElementById('btnCloseDetail').addEventListener('click', () => {
    document.getElementById('detailModal').classList.remove('active');
  });

  // 團隊 Modal 關閉
  document.getElementById('btnCloseTeamModal').addEventListener('click', () => {
    document.getElementById('teamModal').classList.remove('active');
  });

  // 點選卡片開啟小組明細
  document.getElementById('statCardTa').addEventListener('click', () => openTeamModal('A組'));
  document.getElementById('statCardTb').addEventListener('click', () => openTeamModal('B組'));

  // 任務篩選按鈕 (電腦版)
  const filterBtns = document.querySelectorAll('.btn-filter[data-category]');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      
      if (btn.classList.contains('active')) {
        // 取消選取
        btn.classList.remove('active');
        activeFilterCategory = "";
        document.getElementById('mobileFilterSelect').value = "";
      } else {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilterCategory = cat;
        document.getElementById('mobileFilterSelect').value = cat;
      }
      renderEquipment();
    });
  });

  document.getElementById('btnResetFilters').addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    activeFilterCategory = "";
    document.getElementById('mobileFilterSelect').value = "";
    renderEquipment();
  });

  // 手機版篩選下拉選單連動
  document.getElementById('mobileFilterSelect').addEventListener('change', (e) => {
    const cat = e.target.value;
    activeFilterCategory = cat;
    
    // 連動同步更新電腦版按鈕樣式
    filterBtns.forEach(b => {
      if (b.dataset.category === cat) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
    renderEquipment();
  });

  // 設定設定面版內的自訂分頁切換
  const configTabs = [
    document.getElementById('configTab_監測'),
    document.getElementById('configTab_骯髒破壞'),
    document.getElementById('configTab_乾淨切割'),
    document.getElementById('configTab_支撐')
  ];

  configTabs.forEach(tab => {
    if (tab) {
      tab.addEventListener('click', () => {
        configTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeConfigCat = tab.id.replace('configTab_', '');
        renderConfigGrid();
      });
    }
  });
});
