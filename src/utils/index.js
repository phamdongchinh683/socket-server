

function normalizeUserIdList(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((id) => (typeof id === "string" ? id.trim() : String(id)))
      .filter(Boolean);
  }
  if (raw != null && raw !== "") {
    return [typeof raw === "string" ? raw.trim() : String(raw)].filter(Boolean);
  }
  return [];
}

module.exports = {
  normalizeUserIdList,
};