import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './ArticleCard.module.css';

export default function ArticleCard({ article }) {
  const navigate = useNavigate();
  const { id, title, summary, author, publishedAt, readingTime, tag, imageAlt } = article;

  const formattedDate = new Date(publishedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <article
      className={styles.card}
      onClick={() => navigate(`/article/${id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(`/article/${id}`)}
    >
      <div className={styles.imagePlaceholder} aria-label={imageAlt}>
        <span className={styles.imagePlaceholderText}>{imageAlt}</span>
      </div>

      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.tag}>{tag}</span>
          <span className={styles.readingTime}>{readingTime} min read</span>
        </div>

        <h2 className={styles.title}>{title}</h2>
        <p className={styles.summary}>{summary}</p>

        <div className={styles.footer}>
          <div className={styles.authorArea}>
            <div className={styles.avatar} aria-hidden="true">
              {author.name.slice(0, 1)}
            </div>
            <div className={styles.authorInfo}>
              <span className={styles.authorName}>{author.name}</span>
              <span className={styles.authorRole}>{author.role}</span>
            </div>
          </div>
          <time className={styles.date} dateTime={publishedAt}>
            {formattedDate}
          </time>
        </div>
      </div>
    </article>
  );
}
