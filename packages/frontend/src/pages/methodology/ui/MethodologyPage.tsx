import { ArrowUpRight, BookOpen } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { humanMethodology } from './methodology-presentation';

/** Показывает самостоятельный экран методологии без зависимости от оболочки. */
export function MethodologyPage() {
  const sources = [
    {
      title: 'Roadmap: зависимости и направление',
      text: 'Граф отвечает на вопрос «что требуется для чего». Даты показываются отдельно, когда они действительно заданы. Расположение узла не создаёт зависимость.',
      links: [
        [
          'GitHub Projects · Roadmap',
          'https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-roadmap-layout',
        ],
        ['Dagre · directed graph layout', 'https://github.com/dagrejs/dagre'],
      ],
    },
    {
      title: 'Процесс, исполнение и человеческое решение',
      text: 'Развилка здесь — выбор человеком одного пути. Циклы допустимы в схеме процесса; каждый фактический повтор получает новый идентификатор. Решение, исполнение и DoD имеют отдельные статусы.',
      links: [
        ['OMG BPMN 2.0.2', 'https://www.omg.org/spec/BPMN/2.0.2'],
        ['W3C SCXML · State Chart XML', 'https://www.w3.org/TR/scxml/'],
      ],
    },
    {
      title: 'История — источник истины',
      text: 'Факты и ревизии добавляются без перезаписи. Проекции можно восстановить повторным чтением событий. Идемпотентность и проверка версии защищают от повторов и гонок.',
      links: [
        ['Martin Fowler · Event Sourcing', 'https://martinfowler.com/eaaDev/EventSourcing.html'],
        ['Microsoft · CQRS', 'https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs'],
      ],
    },
    {
      title: 'Управляемый и доступный граф',
      text: 'Перекомпоновка выполняется явно. Таблица даёт альтернативный путь к тем же данным. Цвет всегда сопровождается подписью; анимация не нужна для понимания состояния.',
      links: [
        ['React Flow · Accessibility', 'https://reactflow.dev/learn/advanced-use/accessibility'],
        ['WCAG 2.2', 'https://www.w3.org/TR/WCAG22/'],
      ],
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Методология и источники</h1>
          <p>Практики, которые определяют поведение прототипа.</p>
        </div>
      </div>
      <div className={humanMethodology.intro}>
        <BookOpen className={humanMethodology.introIcon} size={24} />
        <div>
          <h2 className={humanMethodology.introTitle}>От литературы — к проверяемым правилам</h2>
          <p className={humanMethodology.introCopy}>
            Выбранные принципы применены к Human View. Ouro не объявляется BPMN-редактором или
            полной реализацией SCXML.
          </p>
        </div>
      </div>
      <div className="methodology-articles">
        {sources.map((s, i) => (
          <article className={humanMethodology.article} key={s.title}>
            <span className={humanMethodology.number}>0{i + 1}</span>
            <div>
              <h2 className={humanMethodology.title}>{s.title}</h2>
              <p className={humanMethodology.copy}>{s.text}</p>
              <div className={humanMethodology.links}>
                {s.links.map(([title, url]) => (
                  <a
                    className={humanMethodology.link}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    key={url}
                  >
                    {title}
                    <ArrowUpRight size={13} />
                  </a>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className={humanMethodology.footnote}>
        <h3 className={humanMethodology.footnoteTitle}>Границы прототипа</h3>
        <p className={humanMethodology.footnoteCopy}>
          MCP-совместимые агенты подключаются через stdio или Streamable HTTP; симулятор доступен
          отдельно для учебных попыток. Контекст Meridian загружается из JSON; нативный мост и SSO
          остаются отдельным этапом. Структура интерфейса основана на Ouro.pen, визуальные токены —
          на Meridian в Figma. Разобранные источники, компромиссы и критерии проверки находятся в
          документации репозитория.
        </p>
        <a
          className={twMerge('btn', humanMethodology.footnoteAction)}
          target="_blank"
          rel="noreferrer"
          href="https://github.com/QahNaaRlN/ouro/tree/feat/meridian-context/docs"
        >
          Открыть документацию
          <ArrowUpRight size={15} />
        </a>
      </div>
    </>
  );
}
