import styles from "./WorkspaceEnhancements.module.css";

export function ProblemFormats({ input, output }: { input?: string; output?: string }) {
  if (!input?.trim() && !output?.trim()) return null;
  return <div className={styles.formats}>
    {[{ title: "Input format", content: input }, { title: "Output format", content: output }].map(({ title, content }) => content?.trim() ? <section key={title} className={styles.format} aria-label={title}>
      <div className={styles.formatHeading}><span>{title}</span></div>
      {/* Authored statement HTML uses the same trusted API source as the description. */}
      {/<[a-z][\s\S]*>/i.test(content) ? <div className={styles.formatBody} dangerouslySetInnerHTML={{ __html: content }} /> : <div className={styles.formatBody}>{content}</div>}
    </section> : null)}
  </div>;
}
