import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './NavBar.module.css';

const TABS = [
  { id: 'feed', label: 'Feed', path: '/' },
];

export default function NavBar({ activeTab, onTabChange }) {
  const navigate = useNavigate();
  const location = useLocation();

  function handleTab(tab) {
    onTabChange(tab.id);
    navigate(tab.path);
  }

  return (
    <header className={styles.navbar}>
      <div className={styles.logoArea}>
        <span className={styles.logoMark}>C</span>
        <span className={styles.logoText}>Chronicle</span>
      </div>
      <nav className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${location.pathname === tab.path ? styles.tabActive : ''}`}
            onClick={() => handleTab(tab)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
