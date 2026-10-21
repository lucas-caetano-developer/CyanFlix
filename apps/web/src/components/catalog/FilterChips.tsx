export type FilterChipOption = {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
};

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'título' : 'títulos'}`;
}

export function FilterChips({
  label,
  options,
  value,
  onChange,
  allLabel = 'Todos',
  allCount,
}: {
  label: string;
  options: FilterChipOption[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  allCount?: number;
}) {
  return (
    <div className="filter-chips" role="group" aria-label={label}>
      <button
        type="button"
        className={`filter-chip${value ? '' : ' filter-chip--active'}`}
        aria-pressed={!value}
        aria-label={allCount === undefined ? allLabel : `${allLabel}, ${countLabel(allCount)}`}
        onClick={() => onChange('')}
      >
        <span>{allLabel}</span>
        {allCount !== undefined && <span className="filter-chip__count" aria-hidden="true">{allCount}</span>}
      </button>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`filter-chip${active ? ' filter-chip--active' : ''}`}
            aria-pressed={active}
            aria-label={option.count === undefined ? option.label : `${option.label}, ${countLabel(option.count)}`}
            disabled={Boolean(option.disabled) && !active}
            onClick={() => onChange(active ? '' : option.value)}
          >
            <span>{option.label}</span>
            {option.count !== undefined && <span className="filter-chip__count" aria-hidden="true">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
