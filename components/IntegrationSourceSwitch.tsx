'use client';

/** Выбор источника сохраняет состояние и жизненный цикл панелей у владельца экрана. */
export function IntegrationSourceSwitch({
  value,
  onValueChange,
}: {
  value: 'github' | 'meridian';
  onValueChange: (value: 'github' | 'meridian') => void;
}) {
  const button =
    'block cursor-pointer rounded-[4px] border border-solid border-transparent bg-transparent px-[15px] py-[7px] text-[12px] text-ouro-text-muted aria-pressed:border-ouro-border aria-pressed:bg-ouro-bg aria-pressed:text-ouro-text focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-control focus-visible:outline-offset-2';
  return (
    <div
      className="integration-source-switch mb-[25px] flex w-fit gap-[4px] rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[4px]"
      role="group"
      aria-label="Источник интеграции"
    >
      <button
        type="button"
        className={button}
        aria-pressed={value === 'github'}
        onClick={() => onValueChange('github')}
      >
        GitHub
      </button>
      <button
        type="button"
        className={button}
        aria-pressed={value === 'meridian'}
        onClick={() => onValueChange('meridian')}
      >
        Meridian
      </button>
    </div>
  );
}
