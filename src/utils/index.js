

function normalizeUserIdList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((id) => (typeof id === "string" ? id.trim() : String(id))).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return [raw.trim()];
  }
  return [];
}

module.exports = {
  normalizeUserIdList,
};