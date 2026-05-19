import React, { useState, useEffect } from 'react';
import ArticleCard from '../components/ArticleCard.jsx';
import TagCloud from '../components/TagCloud.jsx';
import TrendChart from '../components/TrendChart.jsx';
import styles from './FeedScreen.module.css';

const ALL_TAGS = [
  'Technology',
  'Design',
  'Engineering',
  'Swift',
  'SwiftUI',
  'Machine Learning',
  'Web Performance',
  'Accessibility',
  'Open Source',
  'Developer Experience',
  'iOS 18',
  'WWDC',
];

const TREND_DATA = [12, 19, 8, 24, 17, 31, 28, 35, 22, 40, 38, 45];

export default function FeedScreen() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTag, setSelectedTag] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFeed() {
      setLoading(true);
      setError(null);
      try {
        // Fetch from mock API endpoint (relative URL; real server returns JSON)
        const res = await fetch('/api/articles');
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        if (!cancelled) setArticles(data.articles ?? []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFeed();
    return () => { cancelled = true; };
  }, []);

  const filtered = selectedTag
    ? articles.filter(a => a.tag === selectedTag)
    : articles;

  return (
    <div className={styles.screen}>
      {/* ── Hero header ───────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.heroEyebrow}>Daily Edition — May 2026</p>
          <h1 className={styles.heroTitle}>The Chronicle</h1>
          <p className={styles.heroSubtitle}>
            Thoughtful writing on technology, design, and the craft of building software.
          </p>
        </div>
      </section>

      <div className={styles.content}>
        {/* ── Trend chart — TIER3 surface ───────────────────── */}
        {/* TIER3: WebGL canvas chart via TrendChart component.
            This component uses WebGLRenderingContext (GLSL shaders) for
            GPU-accelerated sparkline rendering. It cannot be transpiled to
            SwiftUI; must be replaced with Swift Charts LineChart or WKWebView.
            See TrendChart.jsx for full TIER3 annotation. */}
        <section className={styles.trendSection}>
          <TrendChart
            data={TREND_DATA}
            label="Reader engagement — last 12 weeks"
            color="var(--color-accent)"
          />
        </section>

        {/* ── Tag filter ────────────────────────────────────── */}
        <section className={styles.tagsSection}>
          <h2 className={styles.sectionHeading}>Topics</h2>
          {/* CUSTOM-LAYOUT: flex-wrap:wrap (see TagCloud.module.css) */}
          <TagCloud
            tags={ALL_TAGS}
            selectedTag={selectedTag}
            onTagClick={setSelectedTag}
          />
        </section>

        {/* ── Articles grid ─────────────────────────────────── */}
        <section className={styles.feedSection}>
          <div className={styles.feedHeader}>
            <h2 className={styles.sectionHeading}>
              {selectedTag ? `#${selectedTag}` : 'Latest'}
            </h2>
            {selectedTag && (
              <button
                className={styles.clearFilter}
                onClick={() => setSelectedTag(null)}
              >
                Clear filter
              </button>
            )}
          </div>

          {loading && (
            <div className={styles.stateContainer}>
              <div className={styles.spinner} aria-label="Loading articles" />
              <p className={styles.stateText}>Loading articles…</p>
            </div>
          )}

          {error && !loading && (
            <div className={styles.stateContainer} role="alert">
              <p className={styles.errorHeading}>Failed to load feed</p>
              <p className={styles.stateText}>{error}</p>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className={styles.stateContainer}>
              <p className={styles.stateText}>
                {selectedTag
                  ? `No articles tagged "${selectedTag}" yet.`
                  : 'No articles found.'}
              </p>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className={styles.grid}>
              {filtered.map(article => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
