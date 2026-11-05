/** Оформление оболочки Human View; условным состоянием владеет React-компонент. */
export const humanShell = {
  root: 'app-shell flex min-h-screen',
  sidebar:
    'sidebar fixed inset-y-0 left-0 z-30 flex w-[208px] flex-col overflow-y-auto border-r border-ouro-border bg-ouro-subtle at-most-680:w-[220px] at-most-680:[transform:translateX(-100%)] at-most-680:shadow-[var(--shadow)] at-most-680:transition-[transform] at-most-680:duration-[160ms] at-most-680:ease-[ease]',
  sidebarOpen: 'mobile-open at-most-680:[transform:translateX(0)]',
  brand:
    'brand flex items-center gap-[10px] px-[22px] pt-[25px] pb-[28px] text-[27px] leading-none font-[650] tracking-[-1.3px] at-most-1250:px-[18px] at-most-1250:text-[25px]',
  brandDot: 'brand-dot text-[var(--text-faint)]',
  alpha:
    'alpha-label ml-auto rounded-[3px] border border-ouro-border px-[4px] py-[3px] text-[12px] font-medium tracking-[1px] text-ouro-text-muted',
  navigationLabel:
    'nav-label mb-[10px] px-[22px] text-[12px] tracking-[1.2px] text-[var(--text-faint)]',
  navigation: 'px-[10px]',
  navigationItem:
    'nav-item my-[3px] flex w-full items-center gap-[10px] rounded-[6px] px-[11px] py-[10px] text-left text-[14px] leading-[20px] text-ouro-text-muted hover:bg-ouro-muted hover:text-ouro-text',
  navigationActive: 'active bg-[var(--selected)] text-ouro-text hover:bg-[var(--selected)]',
  navigationFooter: 'gap-[7px] text-[12px] leading-[20px] whitespace-normal',
  count:
    'nav-count ml-auto min-w-[19px] rounded-[4px] bg-[var(--attention-surface)] px-[5px] text-center text-[12px] leading-[19px] text-[var(--attention)]',
  bottom: 'sidebar-bottom mt-auto px-[10px] py-[12px]',
  session:
    'session-status mt-[14px] border-t border-ouro-border px-[11px] pt-[16px] pb-[4px] text-ouro-text-muted wrap-anywhere',
  sessionName: 'block text-[12px] leading-[1.7] font-medium',
  sessionDescription: 'mt-[3px] block text-[12px] leading-[1.7] text-[var(--text-faint)]',
  main: 'app-main ml-[208px] flex min-h-screen w-[calc(100%-208px)] min-w-0 flex-col at-most-680:ml-0 at-most-680:w-full',
  topbar:
    'topbar flex h-[68px] shrink-0 items-center justify-between gap-[16px] border-b border-ouro-border px-[30px] at-most-1250:px-[23px] at-most-680:h-[56px] at-most-680:px-[12px]',
  topbarLeft: 'topbar-left flex items-center gap-[13px] text-[12px] at-most-680:gap-[8px]',
  topbarActions:
    'topbar-actions flex items-center gap-[15px] text-[12px] at-most-1050:gap-[6px] at-most-680:gap-[5px]',
  projectCrumb: 'project-crumb text-[var(--text-faint)] at-most-680:hidden',
  slash: 'crumb-slash text-ouro-border at-most-680:hidden',
  currentProject: 'current-project flex items-center gap-[8px] font-medium at-most-680:text-[12px]',
  currentProjectIcon: 'text-ouro-text-muted',
  projectTag:
    'project-tag ml-[2px] rounded-[4px] border border-ouro-border px-[6px] text-[12px] leading-[18px] text-[var(--text-faint)] at-most-1050:hidden',
  demo: 'demo-label mr-[10px] flex items-center gap-[6px] text-[12px] text-ouro-text-muted at-most-1050:mr-0',
  dot: 'tiny-dot inline-block size-[5px] shrink-0 rounded-full bg-[var(--text-faint)]',
  icon: 'icon-btn inline-flex size-[30px] shrink-0 items-center justify-center rounded-[5px] text-ouro-text-muted hover:bg-ouro-muted hover:text-ouro-text',
  topbarIcon: 'at-most-680:w-[26px]',
  repositoryLink: 'at-most-680:hidden',
  mobileMenu: 'mobile-menu hidden at-most-680:flex',
  body: 'workspace-body flex min-h-0 flex-1',
  content:
    'main-content min-w-0 max-w-[1800px] flex-1 px-[32px] pt-[32px] pb-[24px] min-[1600px]:px-[40px] min-[1600px]:pt-[38px] min-[1600px]:pb-[25px] at-most-1250:px-[23px] at-most-1250:py-[26px] at-most-1050:px-[20px] at-most-1050:py-[25px] at-most-900:p-[28px] at-most-680:px-[17px] at-most-680:pt-[25px] at-most-680:pb-[20px]',
  historicalContent: 'max-w-none',
  context:
    'context-panel flex w-[300px] shrink-0 flex-col border-l border-ouro-border bg-ouro-subtle min-[1600px]:w-[338px] at-most-1250:w-[280px] at-most-900:hidden',
  footer:
    'statusbar mt-auto flex h-auto min-h-[30px] flex-wrap items-center justify-between gap-[12px] border-t border-ouro-border bg-ouro-subtle px-[18px] py-[6px] text-[12px] text-[var(--text-faint)] at-most-680:gap-[7px]',
  footerGroup: 'flex items-center gap-[7px] at-most-680:gap-[5px]',
  footerStorage: 'at-most-680:hidden',
  footerSeparator: 'footer-separator mx-[4px] h-[9px] w-px bg-ouro-border',
  connection: 'connection-dot size-[5px] rounded-full bg-[var(--negative)]',
  connected: 'online bg-ouro-positive',
  error:
    'error-banner flex items-start gap-[9px] border-b border-ouro-border bg-[var(--negative-surface)] px-[24px] py-[11px] text-[12px] text-[var(--negative)] at-most-680:px-[15px] at-most-680:py-[10px]',
  errorIcon: 'mt-px',
  errorClose: 'ml-auto flex p-[2px]',
  toast:
    'toast fixed top-[80px] left-[calc(50%+70px)] z-90 flex max-w-[calc(100vw-40px)] items-center gap-[8px] rounded-[6px] border border-ouro-control bg-ouro-subtle px-[18px] py-[12px] text-[12px] text-ouro-text shadow-[var(--shadow)] [transform:translateX(-50%)] at-most-680:top-[67px] at-most-680:left-1/2 at-most-680:w-max at-most-680:max-w-[calc(100vw-24px)]',
  toastIcon: 'text-ouro-positive',
  loading:
    'loading-screen flex min-h-[500px] flex-1 flex-col items-center justify-center gap-[15px] p-[30px] text-center',
  loadingHeading: 'text-[21px]',
  loadingCopy: 'max-w-[500px] text-[12px] text-ouro-text-muted',
} as const;
