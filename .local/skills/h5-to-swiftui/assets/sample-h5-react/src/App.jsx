import React, { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import FeedScreen from './screens/FeedScreen.jsx';
import ArticleScreen from './screens/ArticleScreen.jsx';
import NavBar from './components/NavBar.jsx';
import styles from './App.module.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('feed');

  return (
    <div className={styles.appRoot}>
      <NavBar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<FeedScreen />} />
          <Route path="/article/:id" element={<ArticleScreen />} />
        </Routes>
      </main>
    </div>
  );
}
