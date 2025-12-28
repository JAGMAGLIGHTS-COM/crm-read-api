const API_URL = "/api/conversations";

let allMessages = [];
let currentUser = null;
let activeChannel = "all";

async function loadData() {
  const res = await fetch(API_URL);
  allMessages = await res.json();
  renderUserList();
}

function renderUserList() {
  const list = document.getElementById("userList");
  list.innerHTML = "";

  const filtered =
    activeChannel === "all"
      ? allMessages
      : allMessages.filter(m => m.channel === activeChannel);

  const users = [...new Set(filtered.map(m => m.user_id))];

  users.forEach(userId => {
    const last = filtered.filter(m => m.user_id === userId).slice(-1)[0];

    const div = document.createElement("div");
    div.className = "chat-item";
    div.innerHTML = `
      <div class="user">${userId}</div>
      <div class="meta">${last.channel}</div>
    `;

    div.onclick = () => openChat(userId, div);
    list.appendChild(div);
  });
}

function openChat(userId, el) {
  currentUser = userId;

  document.querySelectorAll(".chat-item").forEach(i =>
    i.classList.remove("active")
  );
  el.classList.add("active");

  document.getElementById("chatHeader").innerText = userId;
  renderMessages();
}

function renderMessages() {
  const box = document.getElementById("messages");
  box.innerHTML = "";

  allMessages
    .filter(
      m =>
        m.user_id === currentUser &&
        (activeChannel === "all" || m.channel === activeChannel)
    )
    .forEach(m => {
      const div = document.createElement("div");
      div.className = `message ${m.role}`;
      div.innerText = m.message;
      box.appendChild(div);
    });

  box.scrollTop = box.scrollHeight;
}

document.querySelectorAll(".filters button").forEach(btn => {
  btn.onclick = () => {
    document
      .querySelectorAll(".filters button")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeChannel = btn.dataset.channel;

    currentUser = null;
    document.getElementById("chatHeader").innerText = "Select a conversation";
    document.getElementById("messages").innerHTML = "";

    renderUserList();
  };
});

loadData();
