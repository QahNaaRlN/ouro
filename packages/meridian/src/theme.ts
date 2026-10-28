import {MeridianContextError} from './context';
/** Source: Meridian@1d3a9f80b196498b5fe2d8a1357f2aaef2aa9c76,
 * meridian-desktop/ui/src/views/project-workbench/workbench-tokens.css.
 * Scoped palette only. The caller supplies the user's explicit theme choice;
 * no native connection or theme synchronization is inferred by this adapter.
 */
export type MeridianTheme='light'|'dark';
const palettes:Record<MeridianTheme,Record<`--${string}`,string>>={
 light:{
  '--bg':'#fff','--text':'#18181b','--muted':'#f4f4f5','--subtle':'#fafafa','--text-muted':'#52525b',
  '--border':'#e4e4e7','--control':'#e4e4e7','--primary':'#18181b','--primary-text':'#fff','--selected':'#e4e4e7',
  '--positive':'#15803d','--positive-surface':'#f0fdf4','--attention':'#92400e','--attention-surface':'#fffbeb',
  '--negative':'#b91c1c','--negative-surface':'#fef2f2',
 },
 dark:{
  '--bg':'#101113','--text':'#fafafa','--muted':'#24272d','--subtle':'#181a1e','--text-muted':'#b4b8c2',
  '--border':'#343841','--control':'#7c828e','--primary':'#fafafa','--primary-text':'#18181b','--selected':'#626975',
  '--positive':'#86efac','--positive-surface':'#142a1e','--attention':'#fcd34d','--attention-surface':'#332919',
  '--negative':'#fca5a5','--negative-surface':'#321c21',
 },
};
export function getMeridianThemeVariables(theme:unknown):Record<`--${string}`,string>{
 if(theme!=='light'&&theme!=='dark')throw new MeridianContextError('Тема Meridian должна быть light или dark.');
 return {...palettes[theme]};
}
