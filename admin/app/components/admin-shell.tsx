import { ReactNode } from 'react';

export function AdminShell({
  navItems,
  active,
  userPhone,
  userRoles,
  query,
  loading,
  onActive,
  onQuery,
  onExportCsv,
  onExportXlsx,
  onRefresh,
  onLogout,
  children,
}: {
  navItems: string[];
  active: string;
  userPhone: string;
  userRoles: string[];
  query: string;
  loading: boolean;
  onActive: (value: string) => void;
  onQuery: (value: string) => void;
  onExportCsv: () => void;
  onExportXlsx: () => void;
  onRefresh: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">ЕРСИ ГБО</div>
        <nav className="nav">
          {navItems.map((item) => (
            <button
              className={active === item ? 'navItem active' : 'navItem'}
              key={item}
              type="button"
              onClick={() => onActive(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <div className="top">
          <div>
            <div className="label">Production admin</div>
            <h1>Панель управления</h1>
            <p>{userPhone} · {userRoles.join(', ')}</p>
          </div>
          <div className="topActions">
            <input
              className="searchInput"
              placeholder="Поиск"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
            />
            <button className="ghostButton" type="button" onClick={onExportCsv}>CSV</button>
            <button className="ghostButton" type="button" onClick={onExportXlsx}>XLSX</button>
            <button className="ghostButton" type="button" onClick={onRefresh} disabled={loading}>
              {loading ? 'Загрузка...' : 'Обновить'}
            </button>
            <button className="ghostButton" type="button" onClick={onLogout}>Выйти</button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
