import { FILTER_OPTIONS, SORT_OPTIONS } from '../lib/urls';

export default function SortBar({
  sort = 'newest',
  filter = 'all',
  onSortChange,
  onFilterChange,
  count,
}) {
  return (
    <div className="sort-bar">
      <div className="sort-filters" role="group" aria-label="סינון מוצרים">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`chip${filter === option.value ? ' chip-active' : ''}`}
            aria-pressed={filter === option.value ? 'true' : 'false'}
            onClick={() => onFilterChange && onFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="sort-controls">
        {typeof count === 'number' ? (
          <span className="sort-count">{count} מוצרים</span>
        ) : null}

        <label className="sort-select-wrap">
          <span className="sort-select-label">מיון</span>
          <select
            className="sort-select"
            value={sort}
            onChange={(event) => onSortChange && onSortChange(event.target.value)}
            aria-label="מיון מוצרים"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
