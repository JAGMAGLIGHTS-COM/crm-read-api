import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Initialize Supabase (client-side)
const supabase = createClient(
  'https://your-project.supabase.co',  // Replace with your Supabase URL
  'your-anon-key'                      // Replace with your anon key
);

let allMessages = [];
let currentUser = null;
let activeChannel = "all";
let pinnedUsers = new Set();
let leadStages = {};
let searchQuery = '';
let sidebarVisible = true;

// Load persistent data from localStorage
function loadPersistentData() {
  try {
    const savedPinned = localStorage.getItem('pinnedUsers');
    const savedStages = localStorage.getItem('leadStages');
    
    if (savedPinned) {
      pinnedUsers = new Set(JSON.parse(savedPinned));
    }
    
    if (savedStages) {
      leadStages = JSON.parse(savedStages);
    }
  } catch (e) {
    console.warn('Failed to load persistent data:', e);
  }
}

// Save to localStorage
function savePersistentData() {
  try {
    localStorage.setItem('pinnedUsers', JSON.stringify([...pinnedUsers]));
    localStorage.setItem('leadStages', JSON.stringify(leadStages));
  } catch (e) {
    console.warn('Failed to save persistent data:', e);
  }
}

// Lead stages funnel with professional colors
const LEAD_STAGES = [
  { id: 'new', label: '👋 New Lead', color: '#64748b', bg: '#f1f5f9' },
  { id: 'contacted', label: '📞 Contacted', color: '#3b82f6', bg: '#dbeafe' },
  { id: 'qualified', label: '✅ Qualified', color: '#10b981', bg: '#d1fae5' },
  { id: 'proposal', label: '📄 Proposal', color: '#8b5cf6', bg: '#ede9fe' },
  { id: 'negotiation', label: '🤝 Negotiation', color: '#f59e0b', bg: '#fef3c7' },
  { id: 'won', label: '🏆 Won', color: '#059669', bg: '#d1fae5' },
  { id: 'lost', label: '❌ Lost', color: '#ef4444', bg: '#fee2e2' }
];

async function loadData() {
  try {
    // Fetch from Supabase
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .in('channel', ['web', 'whatsapp', 'telegram', 'email', 'text'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    allMessages = data.map(msg => ({
      user_id: msg.user_id,
      channel: msg.channel,
      role: msg.role,
      message: msg.message,
      timestamp: msg.created_at || msg.timestamp || new Date().toISOString(),
      note: msg.note || ''
    }));

    // Load persistent data
    loadPersistentData();
    
    renderUserList();
    updateLeadStats();
    
  } catch (error) {
    console.error('Error loading data:', error);
    showToast('Error loading conversations', 'error');
  }
}

function renderUserList() {
  const list = document.getElementById("userList");
  list.innerHTML = '';

  // Create pinned section if has pinned
  if (pinnedUsers.size > 0) {
    const pinnedHeader = document.createElement("div");
    pinnedHeader.className = "section-header";
    pinnedHeader.innerHTML = `
      <div class="section-title">
        <span class="pin-icon">📌</span>
        <span>Pinned Conversations</span>
        <span class="count-badge">${pinnedUsers.size}</span>
      </div>
    `;
    list.appendChild(pinnedHeader);

    // Show pinned users first
    [...pinnedUsers].forEach(userId => {
      const userMessages = allMessages.filter(m => m.user_id === userId);
      if (userMessages.length > 0) {
        const last = userMessages[userMessages.length - 1];
        renderUserItem(userId, last, userMessages, true);
      }
    });
  }

  // Regular conversations
  let filtered = filterMessages();
  
  // Remove pinned users from regular list (they're already shown in pinned section)
  filtered = filtered.filter(msg => !pinnedUsers.has(msg.user_id));
  
  const uniqueUsers = [...new Set(filtered.map(m => m.user_id))];
  
  if (uniqueUsers.length > 0 || pinnedUsers.size === 0) {
    const sectionHeader = document.createElement("div");
    sectionHeader.className = "section-header";
    sectionHeader.innerHTML = `
      <div class="section-title">
        <span>All Conversations</span>
        <span class="count-badge">${uniqueUsers.length}</span>
      </div>
    `;
    list.appendChild(sectionHeader);
  }

  // Group by date
  const usersByDate = groupUsersByLastMessageDate(filtered);
  
  Object.keys(usersByDate).forEach(dateGroup => {
    // Add date separator
    const dateDiv = document.createElement("div");
    dateDiv.className = "date-separator";
    dateDiv.innerHTML = `<span>${dateGroup}</span>`;
    list.appendChild(dateDiv);

    usersByDate[dateGroup].forEach(userId => {
      const userMessages = filtered.filter(m => m.user_id === userId);
      const last = userMessages[userMessages.length - 1];
      renderUserItem(userId, last, userMessages, false);
    });
  });

  // Empty state
  if (list.children.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <i class="fas fa-comments"></i>
      <h3>No conversations</h3>
      <p>${searchQuery ? 'No results for "' + searchQuery + '"' : 'Start a conversation to see it here'}</p>
    `;
    list.appendChild(empty);
  }
}

function renderUserItem(userId, lastMsg, userMessages, isPinned) {
  const list = document.getElementById("userList");
  const leadStage = leadStages[userId] || 'new';
  const stageConfig = LEAD_STAGES.find(s => s.id === leadStage);
  const unreadCount = userMessages.filter(m => !m.read).length;
  const timeAgo = formatTimeAgo(new Date(lastMsg.timestamp));
  
  const div = document.createElement("div");
  div.className = `chat-item ${isPinned ? 'pinned' : ''} ${unreadCount > 0 ? 'unread' : ''}`;
  div.setAttribute('data-user-id', userId);
  
  div.innerHTML = `
    <div class="chat-item-main">
      <div class="chat-item-header">
        <div class="user-avatar">
          <span style="background: ${stringToColor(userId)}">
            ${userId.charAt(0).toUpperCase()}
          </span>
        </div>
        <div class="user-info">
          <div class="user-name">${userId}</div>
          <div class="channel-badge ${lastMsg.channel}">${getChannelIcon(lastMsg.channel)} ${lastMsg.channel}</div>
        </div>
        <div class="chat-meta">
          <span class="time">${timeAgo}</span>
          ${unreadCount > 0 ? `<span class="unread-indicator">${unreadCount}</span>` : ''}
          ${isPinned ? '<span class="pinned-indicator">📌</span>' : ''}
        </div>
      </div>
      
      <div class="message-preview">${truncateText(lastMsg.message, 60)}</div>
      
      <div class="chat-footer">
        <div class="lead-stage-indicator" style="border-left-color: ${stageConfig.color}">
          <select class="stage-select" onchange="updateLeadStage('${userId}', this.value)" title="Update lead stage">
            ${LEAD_STAGES.map(s => 
              `<option value="${s.id}" ${leadStage === s.id ? 'selected' : ''}>
                ${s.label}
              </option>`
            ).join('')}
          </select>
          <div class="stage-color" style="background: ${stageConfig.color}"></div>
        </div>
        
        <div class="chat-actions">
          <button class="icon-btn pin-btn" onclick="togglePin('${userId}', event)">
            ${isPinned ? '<i class="fas fa-thumbtack"></i>' : '<i class="far fa-thumbtack"></i>'}
          </button>
          <button class="icon-btn" onclick="addNote('${userId}', event)">
            <i class="far fa-sticky-note"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  div.onclick = (e) => {
    if (!e.target.closest('.pin-btn') && 
        !e.target.closest('.stage-select') && 
        !e.target.closest('.icon-btn')) {
      openChat(userId, div);
      if (window.innerWidth <= 768) {
        toggleSidebar();
      }
    }
  };
  
  list.appendChild(div);
}

function togglePin(userId, event) {
  event.stopPropagation();
  
  if (pinnedUsers.has(userId)) {
    pinnedUsers.delete(userId);
  } else {
    pinnedUsers.add(userId);
  }
  
  savePersistentData();
  renderUserList();
}

function updateLeadStage(userId, stage) {
  leadStages[userId] = stage;
  savePersistentData();
  updateLeadStats();
  
  // Update in UI
  const item = document.querySelector(`.chat-item[data-user-id="${userId}"]`);
  if (item) {
    const stageConfig = LEAD_STAGES.find(s => s.id === stage);
    const stageEl = item.querySelector('.lead-stage-indicator');
    if (stageEl) {
      stageEl.style.borderLeftColor = stageConfig.color;
      stageEl.querySelector('.stage-color').style.background = stageConfig.color;
    }
  }
  
  // Update header if this is the current chat
  if (currentUser === userId) {
    const stageLabel = LEAD_STAGES.find(s => s.id === stage).label;
    document.getElementById('chatHeader').innerHTML = `
      <span class="user-header">${userId}</span>
      <span class="stage-badge" style="background: ${stageConfig.bg}; color: ${stageConfig.color}">
        ${stageLabel}
      </span>
    `;
  }
}

function updateLeadStats() {
  const stats = {};
  LEAD_STAGES.forEach(stage => {
    stats[stage.id] = 0;
  });
  
  const allUserIds = [...new Set(allMessages.map(m => m.user_id))];
  allUserIds.forEach(userId => {
    const stage = leadStages[userId] || 'new';
    stats[stage] = (stats[stage] || 0) + 1;
  });
  
  // Update funnel
  const funnel = document.getElementById('leadFunnel');
  if (funnel) {
    funnel.innerHTML = LEAD_STAGES.map(stage => `
      <div class="funnel-stage" onclick="filterByStage('${stage.id}')" 
           style="--stage-color: ${stage.color}; --stage-bg: ${stage.bg}">
        <div class="stage-label">
          <span class="stage-icon" style="color: ${stage.color}">${stage.label.split(' ')[0]}</span>
          <span class="stage-name">${stage.label.split(' ').slice(1).join(' ')}</span>
        </div>
        <div class="stage-count">${stats[stage.id] || 0}</div>
      </div>
    `).join('');
  }
}

function filterByStage(stage) {
  // Filter users by stage
  const filteredUsers = Object.keys(leadStages).filter(userId => leadStages[userId] === stage);
  
  // Show only these users in the list
  const list = document.getElementById("userList");
  const items = list.querySelectorAll('.chat-item');
  
  items.forEach(item => {
    const userId = item.getAttribute('data-user-id');
    if (filteredUsers.includes(userId)) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}

function filterMessages() {
  let filtered = allMessages;
  
  if (activeChannel === "pinned") {
    filtered = filtered.filter(m => pinnedUsers.has(m.user_id));
  } else if (activeChannel !== "all") {
    filtered = filtered.filter(m => m.channel === activeChannel);
  }
  
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    const userIds = [...new Set(filtered.map(m => m.user_id))];
    const matchingUserIds = userIds.filter(userId => 
      userId.toLowerCase().includes(query) ||
      filtered.some(m => 
        m.user_id === userId && 
        m.message.toLowerCase().includes(query)
      )
    );
    filtered = filtered.filter(m => matchingUserIds.includes(m.user_id));
  }
  
  return filtered;
}

function openChat(userId, el) {
  currentUser = userId;
  
  // Update active state
  document.querySelectorAll(".chat-item").forEach(i => 
    i.classList.remove("active")
  );
  if (el) el.classList.add("active");
  
  // Mark messages as read
  allMessages.forEach(msg => {
    if (msg.user_id === userId) {
      msg.read = true;
    }
  });
  
  const stage = leadStages[userId] || 'new';
  const stageConfig = LEAD_STAGES.find(s => s.id === stage);
  
  document.getElementById("chatHeader").innerHTML = `
    <button class="back-btn" onclick="toggleSidebar()">
      <i class="fas fa-chevron-left"></i>
    </button>
    <div class="header-info">
      <span class="user-header">${userId}</span>
      <span class="stage-badge" style="background: ${stageConfig.bg}; color: ${stageConfig.color}">
        ${stageConfig.label}
      </span>
    </div>
    <div class="header-actions">
      <button class="icon-btn" onclick="togglePin('${userId}', event)">
        ${pinnedUsers.has(userId) ? '<i class="fas fa-thumbtack"></i>' : '<i class="far fa-thumbtack"></i>'}
      </button>
      <button class="icon-btn" onclick="addNote('${userId}')">
        <i class="far fa-sticky-note"></i>
      </button>
    </div>
  `;
  
  renderMessages();
}

function renderMessages() {
  const box = document.getElementById("messages");
  box.innerHTML = '';
  
  if (!currentUser) return;
  
  let messages = allMessages.filter(m => 
    m.user_id === currentUser &&
    (activeChannel === "all" || activeChannel === "pinned" || m.channel === activeChannel)
  );
  
  // Group by date
  const messagesByDate = {};
  messages.forEach(msg => {
    const date = new Date(msg.timestamp).toLocaleDateString();
    if (!messagesByDate[date]) messagesByDate[date] = [];
    messagesByDate[date].push(msg);
  });
  
  // Add lead info
  const leadInfo = document.createElement("div");
  leadInfo.className = "lead-info-card";
  const stage = leadStages[currentUser] || 'new';
  const stageConfig = LEAD_STAGES.find(s => s.id === stage);
  
  leadInfo.innerHTML = `
    <div class="lead-status" style="border-left-color: ${stageConfig.color}">
      <strong>Lead Status:</strong>
      <select onchange="updateLeadStage('${currentUser}', this.value)">
        ${LEAD_STAGES.map(s => 
          `<option value="${s.id}" ${stage === s.id ? 'selected' : ''}>
            ${s.label}
          </option>`
        ).join('')}
      </select>
    </div>
    <div class="lead-meta">
      <span><i class="far fa-clock"></i> Last active: ${formatTimeAgo(new Date(messages[messages.length-1]?.timestamp))}</span>
      <span><i class="far fa-comment"></i> ${messages.length} messages</span>
    </div>
  `;
  box.appendChild(leadInfo);
  
  // Render messages
  Object.keys(messagesByDate).forEach(date => {
    const dateSep = document.createElement("div");
    dateSep.className = "date-separator";
    dateSep.innerHTML = `<span>${formatDateHeader(date)}</span>`;
    box.appendChild(dateSep);
    
    messagesByDate[date].forEach(m => {
      const div = document.createElement("div");
      div.className = `message ${m.role} ${m.channel}`;
      
      const time = new Date(m.timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      div.innerHTML = `
        <div class="message-header">
          <span class="message-role">${m.role === 'user' ? 'Customer' : 'Agent'}</span>
          <span class="message-time">${time}</span>
          <span class="message-channel">${getChannelIcon(m.channel)}</span>
        </div>
        <div class="message-content">${highlightSearch(m.message)}</div>
        ${m.note ? `<div class="message-note"><strong>Note:</strong> ${m.note}</div>` : ''}
      `;
      
      box.appendChild(div);
    });
  });
  
  box.scrollTop = box.scrollHeight;
}

// Helper functions
function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

function formatDateHeader(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function groupUsersByLastMessageDate(messages) {
  const users = [...new Set(messages.map(m => m.user_id))];
  const groups = {};
  
  users.forEach(userId => {
    const userMessages = messages.filter(m => m.user_id === userId);
    const lastMsg = userMessages[userMessages.length - 1];
    const date = new Date(lastMsg.timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let groupKey;
    if (date.toDateString() === today.toDateString()) {
      groupKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday';
    } else if ((today - date) < 7 * 86400000) {
      groupKey = date.toLocaleDateString('en-US', { weekday: 'long' });
    } else {
      groupKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(userId);
  });
  
  return groups;
}

function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function highlightSearch(text) {
  if (!searchQuery.trim() || !text) return text;
  const regex = new RegExp(`(${escapeRegExp(searchQuery)})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getChannelIcon(channel) {
  const icons = {
    whatsapp: 'fab fa-whatsapp',
    telegram: 'fab fa-telegram',
    web: 'fas fa-globe',
    email: 'fas fa-envelope',
    text: 'fas fa-sms'
  };
  return `<i class="${icons[channel] || 'fas fa-comment'}"></i>`;
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 40%)`;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }, 10);
}

function addNote(userId, event) {
  if (event) event.stopPropagation();
  
  const note = prompt('Add a note for this lead:');
  if (note) {
    // In a real app, you would save this to your database
    // For now, we'll just show a toast
    showToast('Note added (demo - would save to database)', 'success');
  }
}

function toggleSidebar() {
  sidebarVisible = !sidebarVisible;
  const sidebar = document.querySelector('.sidebar');
  const chatArea = document.querySelector('.chat-area');
  
  if (window.innerWidth <= 768) {
    if (sidebarVisible) {
      sidebar.classList.remove('hidden');
      chatArea.classList.add('hidden');
    } else {
      sidebar.classList.add('hidden');
      chatArea.classList.remove('hidden');
    }
  } else {
    // Tablet/desktop toggle
    sidebar.classList.toggle('collapsed');
    chatArea.classList.toggle('expanded');
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Search functionality
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderUserList();
    if (currentUser) renderMessages();
  });
  
  // Channel filters
  document.querySelectorAll(".filters button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".filters button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeChannel = btn.dataset.channel;
      
      currentUser = null;
      document.getElementById("chatHeader").innerHTML = `
        <button class="back-btn" onclick="toggleSidebar()">
          <i class="fas fa-chevron-left"></i>
        </button>
        <span>Select a conversation</span>
      `;
      document.getElementById("messages").innerHTML = "";
      
      renderUserList();
    };
  });
  
  // Mobile menu toggle
  document.getElementById('mobileMenuToggle')?.addEventListener('click', toggleSidebar);
  
  // Initialize
  loadData();
  
  // Responsive adjustments
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      document.querySelector('.sidebar').classList.remove('hidden');
      document.querySelector('.chat-area').classList.remove('hidden');
    }
  });
});
