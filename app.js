// 地震救援裝備借用系統核心邏輯

// 1. 初始化資料載入
const STORAGE_KEY = 'earthquake_equipment_data';
const SHEET_SETTING_KEY = 'earthquake_sheet_url_or_id';
const MAPPINGS_KEY = 'earthquake_custom_mappings';
const DEFAULT_SHEET_ID = '19bsw5hZYlqhrQmXagK1rr7frNOiqewrBTgJx4JAT2dc';

let equipmentData = [];
let customMappings = { "監測": [], "骯髒破壞": [], "乾淨切割": [], "支撐": [] };
let activeCategory = null; // 首頁當前篩選類別
let activeConfigCat = '監測'; // 設定頁面自訂配置的當前類別

// 初始化
function init() {
  // 載入裝備資料
  const savedData = localStorage.getItem(STORAGE_KEY);
  if (savedData) {
    try {
      equipmentData = JSON.parse(savedData);
    } catch (e) {
      console.error("載入 LocalStorage 失敗，重置為預設資料", e);
      equipmentData = window.initialEquipmentData || [];
    }
  } else {
    equipmentData = window.initialEquipmentData || [];
    saveToStorage();
  }

  // 載入自訂類別對應 (常用箱子)
  const savedMappings = localStorage.getItem(MAPPINGS_KEY);
  if (savedMappings) {
    try {
      customMappings = JSON.parse(savedMappings);
    } catch (e) {
      console.error("載入自訂對應失敗，重新生成", e);
      initializeDefaultMappings();
    }
  } else {
    initializeDefaultMappings();
  }

  // 載入 Google 試算表設定
  const savedSheetSetting = localStorage.getItem(SHEET_SETTING_KEY);
  const sheetInput = document.getElementById('sheetUrlInput');
  if (sheetInput) {
    sheetInput.value = savedSheetSetting || DEFAULT_SHEET_ID;
  }

  // 註冊 Event Listeners
  setupEventListeners();

  // 更新統計、配置面板與首頁渲染
  updateStats();
  renderConfigGrid();
  renderEquipment();
}

// 根據目前裝備箱內容自動初始化自訂推薦對應
function initializeDefaultMappings() {
  customMappings = { "監測": [], "骯髒破壞": [], "乾淨切割": [], "支撐": [] };
  equipmentData.forEach(box => {
    // 依據原始分類推導預設推薦
    box.categories.forEach(cat => {
      if (customMappings[cat]) {
        customMappings[cat].push(box.boxId);
      }
    });
  });
  saveMappings();
}

// 儲存資料到 LocalStorage
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(equipmentData));
}

function saveMappings() {
  localStorage.setItem(MAPPINGS_KEY, JSON.stringify(customMappings));
}

// 2. 註冊事件監聽
function setupEventListeners() {
  // 模糊搜尋輸入監聽
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', () => {
    renderEquipment();
  });

  // 首頁任務篩選按鈕監聽
  const filterBtns = document.querySelectorAll('.rec-buttons .btn-filter');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.getAttribute('data-category');
      
      if (btn.id === 'btnResetFilters') {
        activeCategory = null;
        filterBtns.forEach(b => b.classList.remove('active'));
      } else {
        activeCategory = category;
        filterBtns.forEach(b => {
          if (b.getAttribute('data-category') === category) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      }
      renderEquipment();
    });
  });

  // 設定視窗開關
  const settingsModal = document.getElementById('settingsModal');
  document.getElementById('btnOpenSettings').addEventListener('click', () => {
    renderConfigGrid(); // 開啟時重新整理配置核取方塊
    settingsModal.classList.add('active');
  });
  document.getElementById('btnCloseSettings').addEventListener('click', () => {
    settingsModal.classList.remove('active');
    document.getElementById('syncLog').style.display = 'none';
  });

  // 設定視窗內的任務類別 Tab 切換
  const configTabs = [
    { id: 'configTab_監測', cat: '監測' },
    { id: 'configTab_骯髒破壞', cat: '骯髒破壞' },
    { id: 'configTab_乾淨切割', cat: '乾淨切割' },
    { id: 'configTab_支撐', cat: '支撐' }
  ];
  configTabs.forEach(tab => {
    const el = document.getElementById(tab.id);
    if (el) {
      el.addEventListener('click', () => {
        activeConfigCat = tab.cat;
        configTabs.forEach(t => {
          const btn = document.getElementById(t.id);
          if (t.cat === tab.cat) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
        renderConfigGrid();
      });
    }
  });

  // 詳情視窗關閉
  const detailModal = document.getElementById('detailModal');
  document.getElementById('btnCloseDetail').addEventListener('click', () => {
    detailModal.classList.remove('active');
  });

  // 團隊借用明細視窗開關
  const teamModal = document.getElementById('teamModal');
  document.getElementById('statCardTa').addEventListener('click', () => {
    openTeamModal('A組');
  });
  document.getElementById('statCardTb').addEventListener('click', () => {
    openTeamModal('B組');
  });
  document.getElementById('btnCloseTeamModal').addEventListener('click', () => {
    teamModal.classList.remove('active');
  });

  // 點擊 Modal 外部可關閉
  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove('active');
      document.getElementById('syncLog').style.display = 'none';
    }
    if (e.target === detailModal) {
      detailModal.classList.remove('active');
    }
    if (e.target === teamModal) {
      teamModal.classList.remove('active');
    }
  });

  // 開始同步按鈕
  document.getElementById('btnStartSync').addEventListener('click', () => {
    const sheetInput = document.getElementById('sheetUrlInput').value.trim();
    if (!sheetInput) {
      showToast('⚠️ 請輸入試算表 ID 或網址');
      return;
    }
    localStorage.setItem(SHEET_SETTING_KEY, sheetInput);
    syncFromGoogleSheets(sheetInput);
  });

  // 重置資料按鈕
  document.getElementById('btnResetLocalData').addEventListener('click', () => {
    if (confirm('確定要將裝備與自訂分類重置為預設嗎？這將會清除目前所有的借用狀態。')) {
      equipmentData = window.initialEquipmentData || [];
      saveToStorage();
      initializeDefaultMappings();
      updateStats();
      renderEquipment();
      showToast('🔄 已重置為預設資料');
      settingsModal.classList.remove('active');
    }
  });
}

// 3. 戰情統計數據更新
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

// 4. 裝備看板渲染 (支援搜尋與自訂任務推薦篩選)
function renderEquipment() {
  const grid = document.getElementById('equipmentGrid');
  grid.innerHTML = '';

  const searchQuery = document.getElementById('searchInput').value.trim().toLowerCase();

  // 篩選邏輯
  const filteredData = equipmentData.filter(box => {
    // A. 自訂任務推薦篩選
    if (activeCategory) {
      const matchCat = customMappings[activeCategory] && customMappings[activeCategory].includes(box.boxId);
      if (!matchCat) return false;
    }

    // B. 模糊搜尋篩選
    if (searchQuery) {
      const matchBoxId = box.boxId.toLowerCase().includes(searchQuery);
      const matchGroup = box.group.toLowerCase().includes(searchQuery);
      const matchLocation = box.location.toLowerCase().includes(searchQuery);
      const matchItems = box.items.some(item => 
        item.name.toLowerCase().includes(searchQuery) || 
        item.spec.toLowerCase().includes(searchQuery) ||
        item.power.toLowerCase().includes(searchQuery)
      );
      
      return matchBoxId || matchGroup || matchLocation || matchItems;
    }

    return true;
  });

  if (filteredData.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-secondary);">
        <h3>🔍 找不到符合的裝備箱</h3>
        <p style="margin-top: 10px;">請嘗試更換搜尋關鍵字，或清除分類篩選</p>
      </div>
    `;
    return;
  }

  // 生成卡片 HTML
  filteredData.forEach(box => {
    const card = document.createElement('div');
    card.className = `box-card ${box.status}`;
    
    if (activeCategory) {
      card.classList.add('highlighted');
    }

    // 狀態文字與圖示
    let statusText = '🟢 在庫';
    if (box.status === 'teamA') statusText = '🔵 A組借用中';
    if (box.status === 'teamB') statusText = '🔴 B組借用中';

    // 取得箱子內前 3 項器材清單作為預覽
    const previewItems = box.items.slice(0, 3);
    let itemsHtml = previewItems.map(item => `
      <li>
        <span class="name">${item.name}</span>
        <span class="qty">${item.qty}</span>
      </li>
    `).join('');

    if (box.items.length > 3) {
      itemsHtml += `<div class="more-items-count">+ 還有 ${box.items.length - 3} 項器材明細...</div>`;
    }

    // 取得自訂該箱目前所屬的標籤陣列
    const currentCats = [];
    for (const [cat, list] of Object.entries(customMappings)) {
      if (list.includes(box.boxId)) {
        currentCats.push(cat);
      }
    }
    const tagsHtml = currentCats.length > 0 
      ? currentCats.map(cat => `<span class="category-tag">${cat}</span>`).join('')
      : '<span class="category-tag" style="background: rgba(255,255,255,0.05); color: var(--text-secondary);">無標籤</span>';

    // 卡片主體結構
    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="box-id">${box.boxId}</div>
          <div class="group-badge">${box.group}</div>
        </div>
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span>${statusText}</span>
        </div>
      </div>
      <div class="card-body" onclick="openDetailModal('${box.boxId}')">
        <div class="category-tags">${tagsHtml}</div>
        <ul class="item-summary-list">
          ${itemsHtml}
        </ul>
        <div class="box-location">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          位置: ${box.location || '未標註'}
        </div>
      </div>
      <div class="card-actions">
        ${getCardActionsHtml(box)}
      </div>
    `;

    grid.appendChild(card);
  });
}

// 根據箱子狀態動態生成卡片底部的操作按鈕
function getCardActionsHtml(box) {
  if (box.status === 'available') {
    return `
      <div class="card-actions-row">
        <button class="btn btn-borrow-ta" onclick="borrowBox('${box.boxId}', 'teamA')">🔵 A組借用</button>
        <button class="btn btn-borrow-tb" onclick="borrowBox('${box.boxId}', 'teamB')">🔴 B組借用</button>
      </div>
    `;
  } else {
    const teamLabel = box.status === 'teamA' ? 'A組' : 'B組';
    const timeStr = box.borrowedTime ? `<div style="font-size: 0.75rem; text-align: center; color: var(--text-secondary); margin-bottom: 4px;">借出時間: ${box.borrowedTime}</div>` : '';
    return `
      ${timeStr}
      <button class="btn btn-return" onclick="returnBox('${box.boxId}')">🟢 歸還在庫</button>
    `;
  }
}

// 6. 借用與歸還操作
function borrowBox(boxId, team) {
  const box = equipmentData.find(b => b.boxId === boxId);
  if (!box) return;

  const now = new Date();
  const timeString = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const teamLabel = team === 'teamA' ? 'A組' : 'B組';

  box.status = team;
  box.borrowedBy = teamLabel;
  box.borrowedTime = timeString;

  saveToStorage();
  updateStats();
  renderEquipment();
  showToast(`🔵 已成功借出【${boxId}】給 ${teamLabel}`);
}

function returnBox(boxId) {
  const box = equipmentData.find(b => b.boxId === boxId);
  if (!box) return;

  box.status = 'available';
  box.borrowedBy = '';
  box.borrowedTime = '';

  saveToStorage();
  updateStats();
  renderEquipment();
  showToast(`🟢 已成功歸還【${boxId}】`);
}

// 7. 裝備單箱詳情 Modal
function openDetailModal(boxId) {
  const box = equipmentData.find(b => b.boxId === boxId);
  if (!box) return;

  document.getElementById('modalBoxId').innerText = `📦 裝備箱：${box.boxId}`;
  document.getElementById('modalGroup').innerText = box.group;
  document.getElementById('modalLocation').innerText = box.location || '未標註';

  const tbody = document.getElementById('modalItemTableBody');
  tbody.innerHTML = '';

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

// 8. A組/B組目前借用總明細 Modal
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

// 9. 自訂任務推薦箱子配置渲染與切換
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
      <input type="checkbox" style="accent-color: var(--accent);" ${isChecked ? 'checked' : ''} onchange="toggleBoxMapping('${boxId}', this.checked, this)">
      <span style="color: ${isChecked ? '#fff' : 'var(--text-secondary)'}; font-weight: ${isChecked ? '700' : 'normal'}">${boxId}</span>
    `;
    
    grid.appendChild(label);
  });
}

// 切換自訂箱子勾選狀態
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

  // 立即保存配置
  saveMappings();
  
  // 動態更新當前核取方塊的 label 樣式
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

  // 首頁卡片即時重繪 (分類標籤、篩選都會跟著變)
  renderEquipment();
}

// 10. 雲端同步邏輯：從 Google 試算表同步資料
async function syncFromGoogleSheets(input) {
  const logDiv = document.getElementById('syncLog');
  logDiv.style.display = 'block';
  logDiv.innerHTML = '正在分析試算表連結...<br>';

  // 擷取 Spreadsheet ID
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

  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  logDiv.innerHTML += `準備下載 CSV...<br>`;

  try {
    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error(`HTTP 錯誤狀態: ${response.status}。請確認試算表已開啟「知道連結的任何人均可檢視」分享權限。`);
    }

    const csvText = await response.text();
    logDiv.innerHTML += `下載成功，解析中...<br>`;

    const parsedRows = parseCSV(csvText);
    logDiv.innerHTML += `共解析到 ${parsedRows.length} 列資料。<br>`;

    processSyncedCSV(parsedRows, logDiv);

  } catch (error) {
    console.error(error);
    logDiv.innerHTML += `<span style="color: #ef4444;">❌ 同步失敗：<br>${error.message}</span><br>`;
  }
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

// 處理同步完成的 CSV 數據
function processSyncedCSV(parsedRows, logDiv) {
  let eqRows = [];
  let headerFound = false;
  
  // 動態尋找表頭與邊界
  for (let i = 0; i < parsedRows.length; i++) {
    let r = parsedRows[i];
    if (!r || r.length < 2) continue;
    let col0 = r[0] ? r[0].trim() : "";
    let col1 = r[1] ? r[1].trim() : "";
    
    if (!headerFound) {
      if (col0 === "組別" && col1 === "團體裝備") {
        headerFound = true;
      }
      continue;
    }
    
    // 檢查邊界
    if (col0 === "序號" || col0.includes("合計") || (col0 === "1" && col1.includes("箱"))) {
      break;
    }
    
    eqRows.push(r);
  }

  if (eqRows.length === 0) {
    logDiv.innerHTML += '<span style="color: #ef4444;">❌ 同步失敗：找不到有效的裝備明細資料列！請確認格式是否符合規格。</span><br>';
    return;
  }

  logDiv.innerHTML += `抓取到裝備資料共 ${eqRows.length} 列。<br>`;

  // 暫存原有的借用狀態，避免覆蓋
  const oldStatusMap = {};
  equipmentData.forEach(b => {
    oldStatusMap[b.boxId] = {
      status: b.status,
      borrowedBy: b.borrowedBy,
      borrowedTime: b.borrowedTime
    };
  });

  // 解析箱子與裝備
  const tempBoxes = {};
  let currentGroup = "未分類";
  let lastBox = "";

  eqRows.forEach(r => {
    const groupVal = r[0] ? r[0].trim().replace(/\n/g, '') : '';
    if (groupVal) {
      currentGroup = groupVal;
      lastBox = ""; // Reset on new group
    }

    const itemName = r[1] ? r[1].trim() : '';
    if (!itemName) return;

    const qty = r[2] ? r[2].trim() : '';
    const spec = r[4] ? r[4].trim() : '';
    const power = r[5] ? r[5].trim() : '';
    const consumable = r[6] ? r[6].trim() : '';
    const boxNo = r[7] ? r[7].trim().replace(/\n/g, ' ') : '';
    const weight = r[9] ? r[9].trim() : '';
    const location = (r.length > 11 && r[11]) ? r[11].trim() : '';

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

    // 智能分類
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

  // 組合為最終格式
  const newEquipmentData = [];
  for (const [key, bData] of Object.entries(tempBoxes)) {
    const categoriesArray = Array.from(bData.categories);
    
    // 計算主類別
    let primaryCat = "其他";
    if (bData.categories.has("監測")) primaryCat = "監測";
    else if (bData.categories.has("支撐")) primaryCat = "支撐";
    else if (bData.categories.has("骯髒破壞")) primaryCat = "骯髒破壞";
    else if (bData.categories.has("乾淨切割")) primaryCat = "乾淨切割";

    if (categoriesArray.length > 1 && bData.categories.has("其他")) {
      bData.categories.delete("其他");
    }

    // 還原借用狀態
    let status = "available";
    let borrowedBy = "";
    let borrowedTime = "";
    if (oldStatusMap[key]) {
      status = oldStatusMap[key].status;
      borrowedBy = oldStatusMap[key].borrowedBy;
      borrowedTime = oldStatusMap[key].borrowedTime;
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
      borrowedTime: borrowedTime
    });
  }

  // 排序
  newEquipmentData.sort((a, b) => a.boxId.localeCompare(b.boxId, 'zh-hant'));

  // 更新全域變數與儲存
  equipmentData = newEquipmentData;
  saveToStorage();
  
  // 更新自訂分類對應（保留新出現的箱子預設，不重寫現有的對應）
  const newMappings = { ...customMappings };
  equipmentData.forEach(box => {
    // 遍歷該箱子的各個分類
    box.categories.forEach(cat => {
      if (newMappings[cat]) {
        // 如果該箱子在所有類別的對應中都完全沒出現過（屬於新箱），則加入預設分類
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

  logDiv.innerHTML += `<span style="color: #10b981; font-weight: 700;">✅ 同步成功！共整理出 ${equipmentData.length} 個裝備箱。</span><br>`;
  showToast('🔄 雲端裝備同步成功！');

  // 延遲關閉設定 Modal
  setTimeout(() => {
    document.getElementById('settingsModal').classList.remove('active');
    logDiv.style.display = 'none';
  }, 1500);
}

// 智能分類邏輯
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

// 9. Toast 提示
function showToast(message) {
  const toast = document.getElementById('toastMessage');
  toast.innerText = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// 導出全局函數以供 inline HTML 調用
window.toggleBoxMapping = toggleBoxMapping;

// 啟動系統
window.onload = init;
