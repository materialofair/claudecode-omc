import React from 'react';
import styles from './TagCloud.module.css';

/**
 * TagCloud — a flex-wrap tag gallery with non-uniform item widths.
 *
 * CSS uses `flex-wrap: wrap` with variable-length tag labels.
 * This pattern has NO stock SwiftUI equivalent:
 *   "flex-wrap: wrap → HStack never wraps; LazyHGrid/LazyVGrid are scroll
 *    containers, not inline wrapping layouts" (css-to-swiftui-map.md)
 *
 * CUSTOM-LAYOUT: flex-wrap:wrap — the variable-width tags must reflow onto
 * multiple rows at arbitrary breakpoints determined by available width, which
 * HStack cannot do. SwiftUI port requires the FlowLayout custom Layout protocol.
 */
export default function TagCloud({ tags, onTagClick, selectedTag }) {
  return (
    <div className={styles.cloud}>
      {tags.map(tag => (
        <button
          key={tag}
          className={`${styles.tag} ${selectedTag === tag ? styles.tagSelected : ''}`}
          onClick={() => onTagClick(tag === selectedTag ? null : tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
