import api from './client';
export const generateChecklist = (changeId, jsonFile) => {
  if (jsonFile) {
    const fd = new FormData();
    fd.append('json_file', jsonFile);
    return api.post(`/watson/changes/${changeId}/generate/`, fd,
      { headers: { 'Content-Type': 'multipart/form-data' } });
  }
  return api.post(`/watson/changes/${changeId}/generate/`);
};
export const getChecklist    = (changeId) => api.get(`/watson/changes/${changeId}/checklist/`);
export const passiveScore    = (changeId) => api.post(`/watson/changes/${changeId}/passive-score/`);
export const exportChecklist = (changeId, baseURL) => `${baseURL}/watson/changes/${changeId}/export/`;
export const acceptItem      = (itemId, data) => api.patch(`/watson/items/${itemId}/accept/`, data);
