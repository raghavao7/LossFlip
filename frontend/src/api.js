import axios from 'axios';
export const api = axios.create({ baseURL: '/api' });

export function setActingUser(who) {
  api.defaults.headers.common['x-user'] = who; // 'raj' or 'neha'
}
setActingUser('raj');
