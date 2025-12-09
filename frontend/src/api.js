import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:8080/api',
  withCredentials: true // IMPORTANT for JWT cookies
});

// existing setActingUser stays as-is
export function setActingUser(who) {
  api.defaults.headers['x-user'] = who;
}
