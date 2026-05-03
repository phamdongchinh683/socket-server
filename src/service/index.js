function normalizeUnreadPayload(data, boxIdFromRequest) {
  const root =
    data && typeof data === "object" && data.data != null
      ? data.data
      : data;
  const p = root && typeof root === "object" ? root : {};

  return {
    unreadReceiverCount:
      p.unreadReceiverCount ?? p.receiverUnreadCount ?? p.receiver_unread,
    unreadSenderCount:
      p.unreadSenderCount ?? p.senderUnreadCount ?? p.sender_unread,
    boxId: p.boxId != null ? p.boxId : boxIdFromRequest,
  };
}

async function readUnreadCount({ baseUrl, boxId, token }) {
  const root = String(baseUrl || "").replace(/\/+$/, "");
  if (!root) {
    throw new Error("API_URL / baseUrl is empty");
  }

  const url = `${root}/chat/box/${encodeURIComponent(boxId)}/unread-count`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      raw && typeof raw === "object"
        ? raw.message || raw.error
        : null;
    throw new Error(msg || `HTTP ${res.status}`);
  }

  if (raw == null || typeof raw !== "object") {
    throw new Error("Invalid JSON response from unread-count API");
  }

  return normalizeUnreadPayload(raw, boxId);
}

module.exports = { readUnreadCount };
