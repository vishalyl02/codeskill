"use client";

import { Search, ChevronDown, ArrowUpRight, CheckCircle2, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect } from "react";
import { problemsAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import PracticePet from "@/components/pet/PracticePet";
import { parsePublicProblemList, type PublicProblemList } from "@/lib/public-problems";

import { useProblemProgress } from "@/hooks/useProblemProgress";
import { ProblemProgressMark } from "@/components/problems/ProblemProgressMark";

import styles from "./Problems.module.css";

const ITEMS_PER_PAGE = 20;

export default function ProblemsPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All Topics");
  const [difficulty, setDifficulty] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [result, setResult] = useState<{ key: string; data: PublicProblemList; error: string | null } | null>(null);
  const requestKey = JSON.stringify([currentPage, debouncedSearch, activeCategory, difficulty, retry]);
  const loading = result?.key !== requestKey;
  const error = loading ? null : result?.error;
  const problems = result?.data.problems ?? [];
  const totalPages = result?.data.totalPages ?? 1;
  const totalItems = result?.data.total ?? 0;

  useEffect(() => {
    const query = search.trim();
    if (query === debouncedSearch) return;
    const timer = setTimeout(() => {
      setDebouncedSearch(query);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    const request = difficulty === "All"
      ? problemsAPI.getAll(currentPage, ITEMS_PER_PAGE, debouncedSearch, activeCategory, controller.signal)
      : problemsAPI.getAll(currentPage, ITEMS_PER_PAGE, debouncedSearch, activeCategory, controller.signal, difficulty);
    request
      .then(response => {
        if (controller.signal.aborted) return;
        const data = parsePublicProblemList(response.data, ITEMS_PER_PAGE);
        setResult({ key: requestKey, data, error: null });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, data: { problems: [], total: 0, totalPages: 1 }, error: "Problems could not be loaded. Please try again." });
      });
    return () => controller.abort();
  }, [currentPage, debouncedSearch, activeCategory, difficulty, requestKey]);

  const categories = ["All Topics", "Arrays", "Strings", "Dynamic Programming", "Trees", "Graphs", "Math"];

  const filtered = problems;
  const progress = useProblemProgress(problems.map(problem => problem.id));

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };


  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Practice library</p>
            <h1>Problems</h1>
          </div>
          <div className={styles.catalogCount} aria-live="polite">
            <strong>{loading || error ? "—" : totalItems.toLocaleString()}</strong>
            <span>{activeCategory === "All Topics" && difficulty === "All" && !debouncedSearch ? "problems to explore" : "matching problems"}</span>
          </div>
        </header>

        <div className={styles.tools}>
          <div className={styles.search}>
            <Search size={17} aria-hidden="true" />
            <input type="search" aria-label="Search problems" placeholder="Search problems…" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <label className={styles.difficultyFilter}>
            <span>Difficulty</span>
            <select aria-label="Filter by difficulty" value={difficulty} onChange={event => { setDifficulty(event.target.value); setCurrentPage(1); }}>
              <option value="All">All difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        </div>

        <nav className={styles.topics} aria-label="Problem topics">
          {categories.map(category => (
            <button type="button" key={category} aria-pressed={activeCategory === category} onClick={() => { setActiveCategory(category); setCurrentPage(1); }}>
              {category}
            </button>
          ))}
        </nav>

        <section className={styles.catalog} aria-label="Problem catalog">
          <div className={styles.tableScroll}>
            <table className={styles.table} aria-busy={loading}>
              <colgroup><col className={styles.statusColumn}/><col/><col className={styles.difficultyColumn}/><col className={styles.categoryColumn}/><col className={styles.acceptanceColumn}/></colgroup>
              <thead>
                <tr>
                  <th className={styles.statusCell} scope="col">Status</th>
                  <th scope="col">Problem</th>
                  <th scope="col">Difficulty</th>
                  <th scope="col">Topic</th>
                  <th className={styles.acceptanceCell} scope="col">Acceptance</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className={styles.stateCell}><span role="status" aria-label="Loading problems"><Spinner className="w-5 h-5 animate-spin mx-auto" /></span></td></tr>
                ) : error ? (
                  <tr><td colSpan={5} className={styles.stateCell}>
                    <p role="alert">{error}</p>
                    <Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Try again</Button>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className={styles.stateCell}>
                    <strong>No problems found matching your criteria.</strong>
                    <p>Try another topic, difficulty, or search.</p>
                  </td></tr>
                ) : filtered.map((problem, index) => (
                  <tr key={problem.id}>
                    <td className={styles.statusCell}><ProblemProgressMark status={progress[problem.id]} className="w-[18px] h-[18px] mx-auto" /></td>
                    <td>
                      <div className={styles.problemTitle}>
                        <span className={styles.number} aria-hidden="true">{String((currentPage - 1) * ITEMS_PER_PAGE + index + 1).padStart(2, "0")}</span>
                        {problem.slug ? <Link href={`/problems/${encodeURIComponent(problem.slug)}`}>
                          <span>{problem.title}</span><ArrowUpRight size={14} aria-hidden="true" />
                        </Link> : <span>{problem.title}</span>}
                      </div>
                    </td>
                    <td><span className={`${styles.difficulty} ${styles[problem.difficulty.toLowerCase()] || ""}`}><i aria-hidden="true" />{problem.difficulty}</span></td>
                    <td><span className={styles.category}>{problem.categories[0] || "General"}</span></td>
                    <td className={styles.acceptanceCell}><span className={styles.rate}>{problem.stats.acceptanceRate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className={styles.catalogFooter}>
            <div className={styles.legend} aria-label="Problem status legend">
              <span><CheckCircle2 size={14} className={styles.solvedIcon} aria-hidden="true"/> Solved</span>
              <span><CircleDot size={14} className={styles.attemptedIcon} aria-hidden="true"/> Attempted</span>
            </div>
            {!error && !loading && <div className={styles.pagination}>
              <p>{totalItems === 0 ? "0 problems" : <><span>{(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, totalItems)}</span> of <span>{totalItems}</span> problems</>}</p>
              {totalPages > 1 && <div className={styles.pageButtons}>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(value => Math.max(1, value - 1))} disabled={currentPage === 1 || loading}>Previous</Button>
                {getPageNumbers().map((pageNumber, index) => pageNumber === "..." ? <span key={`gap-${index}`}>…</span> :
                  <Button key={`${pageNumber}-${index}`} variant={currentPage === pageNumber ? "default" : "outline"} size="sm" aria-current={currentPage === pageNumber ? "page" : undefined} onClick={() => setCurrentPage(pageNumber as number)} disabled={loading}>{pageNumber}</Button>)}
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(value => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages || loading}>Next</Button>
              </div>}
            </div>}
          </footer>
        </section>
      </div>
      <PracticePet />
    </main>
  );
}
