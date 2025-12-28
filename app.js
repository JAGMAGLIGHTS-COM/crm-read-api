const API_URL = "/api/conversations";

let allMessages = [];
let currentUser = null;
let activeChannel = "all";
let pinnedUsers = new Set(JSON.parse(localStorage.getItem('pinnedUsers') || '[]'));
let leadStages = JSON.parse(localStorage.getItem('leadStages') || '{}');
let searchQuery = '';

// Lead stages funnel
const LEAD_STAGES = [
  { id: 'new', label: '👋 New Lead', color: '#FF6B6B' },
  { id: 'contacted', label: '📞 Contacted', color: '#4ECDC4' },
  { id: 'qualified', label: '✅ Qualified', color: '#45B7D1' },
  { id: 'proposal', label: '📄 Proposal Sent', color: '#96CEB4' },
  { id: 'negotiation', label: '🤝 Negotiation', color: '#FFEAA7' },
  { id: 'won', label: '🏆 Won', color: '#55EFC4' },
  { id: 'lost', label: '❌ Lost', color: '#FD79A8' }
];

async function loadData() {
  const res = await fetch(API_URL);
  allMessages = await res.json();
  // Add timestamps if not present (for demo)
  allMessages.forEach(msg => {
    if (!msg.timestamp) {
      msg.timestamp = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();
    }
  });
  renderUserList();
  updateLeadStats();
}

function renderUserList() {
  const list = document.getElementById("userList");
  list.innerHTML = '';

  // Create pinned section
  if (pinnedUsers.size > 0) {
    const pinnedHeader = document.createElement("div");
    pinnedHeader.className = "section-header";
    pinnedHeader.innerHTML = `<span>📌 Pinned (${pinnedUsers.size})</span>`;
    list.appendChild(pinnedHeader);
  }

  let filtered = filterMessages();

  // Group by date for separators
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
      const isPinned = pinnedUsers.has(userId);
      
      // Only show in pinned section if filtered
      if (activeChannel === "pinned" && !isPinned) return;
      if (activeChannel !== "pinned" && isPinned) {
        // Already shown in pinned section
        return;
      }

      renderUserItem(userId, last, userMessages, isPinned);
    });
  });

  // Add empty state
  if (list.children.length === (pinnedUsers.size > 0 ? 1 : 0)) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<p>No conversations found</p>`;
    list.appendChild(empty);
  }
}

function renderUserItem(userId, lastMsg, userMessages, isPinned) {
  const list = document.getElementById("userList");
  const leadStage = leadStages[userId] || 'new';
  const stageConfig = LEAD_STAGES.find(s => s.id === leadStage);
  
  const div = document.createElement("div");
  div.className = `chat-item ${isPinned ? 'pinned' : ''}`;
  div.setAttribute('data-user-id', userId);
  div.setAttribute('data-stage', leadStage);
  
  const messageCount = userMessages.length;
  const unreadCount = userMessages.filter(m => !m.read).length;
  
  const timeAgo = formatTimeAgo(new Date(lastMsg.timestamp));
  
  div.innerHTML = `
    <div class="chat-item-header">
      <div class="user-info">
        <div class="user">${userId}</div>
        ${isPinned ? '<span class="pin-indicator">📌</span>' : ''}
      </div>
      <div class="chat-actions">
        <button class="btn-pin" onclick="togglePin('${userId}', event)">
          ${isPinned ? 'Unpin' : 'Pin'}
        </button>
        <span class="time">${timeAgo}</span>
      </div>
    </div>
    <div class="meta">
      <span class="channel">${lastMsg.channel}</span>
      <span class="message-count">${messageCount} msg</span>
      ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
    </div>
    <div class="message-preview">${truncateText(lastMsg.message, 50)}</div>
    <div class="lead-stage" style="background-color: ${stageConfig.color}22; border-left-color: ${stageConfig.color}">
      <select class="stage-select" onchange="updateLeadStage('${userId}', this.value)" title="Update lead stage">
        ${LEAD_STAGES.map(s => 
          `<option value="${s.id}" ${leadStage === s.id ? 'selected' : ''}>${s.label}</option>`
        ).join('')}
      </select>
      <div class="stage-indicator" style="background: ${stageConfig.color}"></div>
    </div>
  `;

  div.onclick = (e) => {
    if (!e.target.closest('.btn-pin') && !e.target.closest('.stage-select')) {
      openChat(userId, div);
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
  
  localStorage.setItem('pinnedUsers', JSON.stringify([...pinnedUsers]));
  renderUserList();
}

function updateLeadStage(userId, stage) {
  leadStages[userId] = stage;
  localStorage.setItem('leadStages', JSON.stringify(leadStages));
  updateLeadStats();
  
  // Update the chat item
  const item = document.querySelector(`.chat-item[data-user-id="${userId}"]`);
  if (item) {
    item.setAttribute('data-stage', stage);
    const stageConfig = LEAD_STAGES.find(s => s.id === stage);
    const stageEl = item.querySelector('.lead-stage');
    stageEl.style.backgroundColor = `${stageConfig.color}22`;
    stageEl.style.borderLeftColor = stageConfig.color;
    stageEl.querySelector('.stage-indicator').style.background = stageConfig.color;
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
  
  // Update funnel display
  const funnel = document.getElementById('leadFunnel');
  if (funnel) {
    funnel.innerHTML = LEAD_STAGES.map(stage => `
      <div class="funnel-stage" style="border-color: ${stage.color}">
        <span class="stage-label">${stage.label}</span>
        <span class="stage-count">${stats[stage.id] || 0}</span>
      </div>
    `).join('');
  }
}

function filterMessages() {
  let filtered = allMessages;
  
  // Filter by channel
  if (activeChannel === "pinned") {
    filtered = filtered.filter(m => pinnedUsers.has(m.user_id));
  } else if (activeChannel !== "all") {
    filtered = filtered.filter(m => m.channel === activeChannel);
  }
  
  // Filter by search
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
  
  document.querySelectorAll(".chat-item").forEach(i => 
    i.classList.remove("active")
  );
  if (el) el.classList.add("active");
  
  document.getElementById("chatHeader").innerText = `${userId} - ${leadStages[userId] || 'new'}`;
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
  
  // Group messages by date
  const messagesByDate = {};
  messages.forEach(msg => {
    const date = new Date(msg.timestamp).toLocaleDateString();
    if (!messagesByDate[date]) messagesByDate[date] = [];
    messagesByDate[date].push(msg);
  });
  
  // Render with date separators
  Object.keys(messagesByDate).forEach(date => {
    // Add date separator
    const dateSep = document.createElement("div");
    dateSep.className = "date-separator";
    dateSep.innerHTML = `<span>${formatDateHeader(date)}</span>`;
    box.appendChild(dateSep);
    
    // Add messages for this date
    messagesByDate[date].forEach(m => {
      const div = document.createElement("div");
      div.className = `message ${m.role}`;
      
      const time = new Date(m.timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      div.innerHTML = `
        <div class="message-content">${highlightSearch(m.message)}</div>
        <div class="message-time">${time} • ${m.channel}</div>
      `;
      
      box.appendChild(div);
    });
  });
  
  box.scrollTop = box.scrollHeight;
}

function highlightSearch(text) {
  if (!searchQuery.trim()) return text;
  const regex = new RegExp(`(${escapeRegExp(searchQuery)})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
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
  
  // Sort groups chronologically
  const sortedGroups = {};
  const order = ['Today', 'Yesterday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  order.forEach(key => {
    if (groups[key]) sortedGroups[key] = groups[key];
  });
  
  // Add remaining months
  Object.keys(groups).forEach(key => {
    if (!sortedGroups[key]) sortedGroups[key] = groups[key];
  });
  
  return sortedGroups;
}

function truncateText(text, maxLength) {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

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
    document.getElementById("chatHeader").innerText = "Select a conversation";
    document.getElementById("messages").innerHTML = "";
    
    renderUserList();
  };
});

loadData();
