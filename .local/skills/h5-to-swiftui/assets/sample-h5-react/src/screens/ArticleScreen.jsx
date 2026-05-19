import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './ArticleScreen.module.css';

export default function ArticleScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadArticle() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/articles/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        if (!cancelled) setArticle(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadArticle();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className={styles.stateContainer}>
        <div className={styles.spinner} aria-label="Loading article" />
        <p className={styles.stateText}>Loading article…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.stateContainer} role="alert">
        <p className={styles.errorHeading}>Could not load article</p>
        <p className={styles.stateText}>{error}</p>
        <button className={styles.backButton} onClick={() => navigate('/')}>
          ← Back to feed
        </button>
      </div>
    );
  }

  if (!article) return null;

  const {
    title,
    subtitle,
    author,
    publishedAt,
    readingTime,
    tag,
    body,
  } = article;

  const formattedDate = new Date(publishedAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <article className={styles.article}>
      {/* ── Back navigation ───────────────────────────────────── */}
      <div className={styles.topBar}>
        <button className={styles.backButton} onClick={() => navigate('/')}>
          ← Chronicle
        </button>
        <span className={styles.tagChip}>{tag}</span>
      </div>

      {/* ── Article header ────────────────────────────────────── */}
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && (
          <p className={styles.subtitle}>{subtitle}</p>
        )}

        <div className={styles.byline}>
          <div className={styles.avatarLg} aria-hidden="true">
            {author.name.slice(0, 1)}
          </div>
          <div className={styles.bylineText}>
            <span className={styles.authorName}>{author.name}</span>
            <span className={styles.authorMeta}>
              {author.role} · <time dateTime={publishedAt}>{formattedDate}</time> · {readingTime} min read
            </span>
          </div>
        </div>
      </header>

      {/* ── Body — text-heavy, multi-typographic-level region ─── */}
      {/*
       * TEXT REGION NOTE (skill stage 2):
       * This body region is intentionally text-heavy with multiple typographic
       * levels (h2 headlines, pull-quote, body paragraphs, code block, caption).
       * The skill must apply layout-box IoU + token-color ΔE for region
       * comparison, NOT glyph SSIM, because CoreText metrics diverge from
       * WebKit at identical px declarations (see stack-detection.md reason 4).
       */}
      <div className={styles.body}>
        {body.map((block, idx) => (
          <ArticleBlock key={idx} block={block} />
        ))}
      </div>

      {/* ── Article footer ────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerDivider} />
        <div className={styles.authorCard}>
          <div className={styles.avatarLg} aria-hidden="true">
            {author.name.slice(0, 1)}
          </div>
          <div className={styles.authorCardText}>
            <span className={styles.authorCardName}>{author.name}</span>
            <span className={styles.authorCardRole}>{author.role}</span>
            {author.bio && (
              <p className={styles.authorBio}>{author.bio}</p>
            )}
          </div>
        </div>
      </footer>
    </article>
  );
}

// ── Block renderer ────────────────────────────────────────────────────────────

function ArticleBlock({ block }) {
  switch (block.type) {
    case 'paragraph':
      return <p className={styles.paragraph}>{block.text}</p>;

    case 'heading':
      return <h2 className={styles.heading2}>{block.text}</h2>;

    case 'subheading':
      return <h3 className={styles.heading3}>{block.text}</h3>;

    case 'pullquote':
      return (
        <blockquote className={styles.pullquote}>
          <p className={styles.pullquoteText}>{block.text}</p>
          {block.attribution && (
            <cite className={styles.pullquoteAttribution}>{block.attribution}</cite>
          )}
        </blockquote>
      );

    case 'code':
      return (
        <figure className={styles.codeFigure}>
          {block.caption && (
            <figcaption className={styles.codeCaption}>{block.caption}</figcaption>
          )}
          <pre className={styles.pre}>
            <code className={styles.code}>{block.text}</code>
          </pre>
        </figure>
      );

    case 'caption':
      return <p className={styles.caption}>{block.text}</p>;

    case 'divider':
      return <hr className={styles.divider} />;

    default:
      return null;
  }
}
