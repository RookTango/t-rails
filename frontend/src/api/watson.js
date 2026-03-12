import api from './client';
export const generateChecklist = (changeId, phase = 'AUTHORIZE') => api.post(`/watson/changes/${changeId}/generate-checklist/`, { phase });
export const evaluateImplementation = (changeId) => api.post(`/watson/changes/${changeId}/evaluate/`);
export const getChecklists = (changeId) => api.get(`/watson/changes/${changeId}/checklists/`);
export const approveChecklist = (checklistId) => api.post(`/watson/checklists/${checklistId}/approve/`);
