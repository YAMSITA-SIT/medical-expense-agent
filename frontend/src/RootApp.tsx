import UserApp from './App';
import { StaffApp } from './staff/StaffApp';

export default function RootApp() {
  const path = window.location.pathname;
  return path === '/staff' || path.startsWith('/staff/') ? <StaffApp path={path} /> : <UserApp />;
}
