"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminAssessmentsAPI } from "@/config/api";
import { useAssessmentStore } from "./_store/useAssessmentStore";
import QuestionPicker from "./_components/QuestionPicker";
import { 
  ArrowLeft, CheckCircle2, Clock, Plus, Trash2, ShieldAlert,
  GripVertical, Settings, Save, AlertTriangle
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ToastProvider, useToast } from "../../questions/create/_components/Toast"; // Reuse toast

export default function AssessmentBuilderWrapper() {
  return (
    <ToastProvider>
      <AssessmentBuilder />
    </ToastProvider>
  )
}

function AssessmentBuilder() {
  const router = useRouter();
  const store = useAssessmentStore();
  const { addToast } = useToast();
  
  const [activePicker, setActivePicker] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<'draft' | 'published' | 'ongoing' | 'completed' | 'archived'>('draft');
  const [formReady, setFormReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    const assessmentId = new URLSearchParams(window.location.search).get('id');
    const hydrate = async () => {
      if (!assessmentId) {
        store.reset();
        if (active) setFormReady(true);
        return;
      }

      try {
        const response = await adminAssessmentsAPI.getById(assessmentId);
        const assessment = response.data?.assessment ?? response.data?.data?.assessment;
        if (!assessment) throw new Error('Assessment details were not returned by the server.');

        const questionById = new Map<string, any>();
        (assessment.questions || []).forEach((question: any) => {
          [question.id, question._id, question.mongoId].filter(Boolean).forEach((id: string) => questionById.set(String(id), question));
        });
        const sections = (assessment.sections || []).map((section: any, sectionIndex: number) => ({
          id: `saved-section-${sectionIndex}`,
          title: section.title || `Section ${String.fromCharCode(65 + sectionIndex)}`,
          description: section.description || '',
          order: Number(section.order ?? sectionIndex),
          timeLimit: Number(section.timeLimit ?? 0),
          questions: (section.questions || []).map((config: any, questionIndex: number) => {
            const embedded = typeof config.questionId === 'object' ? config.questionId : undefined;
            const id = embedded?._id || embedded?.id || String(config.questionId);
            const question = embedded || questionById.get(String(id));
            return {
              questionId: String(id),
              marks: Number(config.marks ?? question?.marks ?? 1),
              negativeMarks: Number(config.negativeMarks ?? question?.negativeMarks ?? 0),
              order: Number(config.order ?? questionIndex),
              topic: question?.topic,
              difficulty: question?.difficulty,
              questionText: question?.question || question?.questionText || `Question ${questionIndex + 1}`,
              questionType: question?.questionType || 'mcq',
            };
          }),
        }));

        if (sections.length === 0 && (assessment.questions || []).length > 0) {
          sections.push({
            id: 'saved-section-0', title: 'Section A', description: '', order: 0, timeLimit: 0,
            questions: assessment.questions.map((question: any, index: number) => {
              const embedded = typeof question === 'object' ? question : questionById.get(String(question));
              const id = embedded?._id || embedded?.id || String(question);
              return {
                questionId: String(id), marks: Number(embedded?.marks ?? 1),
                negativeMarks: Number(embedded?.negativeMarks ?? 0), order: index,
                topic: embedded?.topic, difficulty: embedded?.difficulty,
                questionText: embedded?.question || embedded?.questionText || `Question ${index + 1}`,
                questionType: embedded?.questionType || 'mcq',
              };
            }),
          });
        }
        if (sections.length === 0) sections.push({ id: 'saved-section-0', title: 'Section A', description: '', order: 0, timeLimit: 0, questions: [] });

        store.hydrate({
          title: assessment.title || '', code: assessment.code || '', description: assessment.description || '',
          instructions: assessment.instructions || store.instructions,
          durationMinutes: Number(assessment.durationMinutes ?? 60),
          passingMarks: assessment.passingMarks == null ? '' : Number(assessment.passingMarks),
          negativeMarking: assessment.negativeMarking ?? true, category: assessment.category || 'exam',
          allowedAttempts: Number(assessment.allowedAttempts ?? 1), proctoring: assessment.proctoring || {},
          sections, status: assessment.status === 'published' ? 'published' : 'draft',
        });
        if (active) {
          setEditingId(assessmentId);
          setEditingStatus(assessment.status || 'draft');
          setFormReady(true);
        }
      } catch (error) {
        console.error('Failed to load assessment for editing:', error);
        if (active) {
          const message = error instanceof Error ? error.message : 'Assessment details could not be loaded.';
          setLoadError(message);
          addToast('error', 'Unable to edit assessment', message);
          setFormReady(true);
        }
      }
    };
    void hydrate();
    return () => { active = false; };
  }, []);

  // Calculate totals
  const totalQuestions = store.sections.reduce((acc, sec) => acc + sec.questions.length, 0);
  const totalMarks = store.sections.reduce((acc, sec) => acc + sec.questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0), 0);

  const handlePublish = async (status: 'draft' | 'published' | 'ongoing' | 'completed' | 'archived') => {
    if (!store.title.trim() || !store.code.trim()) {
      addToast("error", "Validation Error", "Title and Code are required.");
      return;
    }
    if (store.sections.length === 0) {
      addToast("error", "Validation Error", "At least one section is required.");
      return;
    }
    if (totalQuestions === 0) {
      addToast("error", "Validation Error", "At least one question is required across sections.");
      return;
    }
    if (!(Number(store.durationMinutes) > 0)) {
      addToast("error", "Validation Error", "Duration must be at least 1 minute.");
      return;
    }
    if (store.passingMarks !== '' && (Number(store.passingMarks) < 0 || Number(store.passingMarks) > totalMarks)) {
      addToast("error", "Validation Error", `Passing marks must be between 0 and total marks (${totalMarks}).`);
      return;
    }

    setIsPublishing(true);
    try {
      const payload = {
        title: store.title,
        code: store.code,
        description: store.description,
        durationMinutes: store.durationMinutes,
        passingMarks: store.passingMarks === '' ? Math.ceil(totalMarks * 0.4) : Number(store.passingMarks),
        category: store.category,
        allowedAttempts: store.allowedAttempts,
        negativeMarking: store.negativeMarking,
        proctoring: store.proctoring,
        instructions: store.instructions,
        status,
        sections: store.sections.map(s => ({
          title: s.title,
          description: s.description,
          order: s.order,
          timeLimit: s.timeLimit,
          questions: s.questions.map(q => ({
            questionId: q.questionId,
            marks: Number(q.marks),
            negativeMarks: Number(q.negativeMarks),
            order: q.order
          }))
        }))
      };
      if (editingId) await adminAssessmentsAPI.update(editingId, { ...payload, status });
      else await adminAssessmentsAPI.create(payload);
      
      addToast("success", "Success", editingId ? "Assessment updated" : `Assessment ${status === 'published' ? 'published' : 'saved as draft'}`);
      setTimeout(() => router.push("/admin/assessments"), 1000);
    } catch (err: any) {
      addToast("error", "Error", err.response?.data?.message || "Failed to create assessment.");
      setIsPublishing(false);
      setShowConfirm(false);
    }
  };

  if (loadError) return <div className="min-h-screen bg-background p-8 text-foreground"><p className="mb-4">{loadError}</p><Link href="/admin/assessments" className="text-primary underline">Back to assessments</Link></div>;
  if (!formReady) return <div className="min-h-screen bg-background flex items-center justify-center gap-3 text-muted-foreground"><Spinner className="w-5 h-5 animate-spin" /> Loading assessment and questions...</div>;

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/assessments" className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-base font-bold text-foreground">{editingId ? "Edit Assessment" : "Assessment Builder"}</h1>
              <p className="text-[11px] text-muted-foreground font-medium">Design professional evaluations.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-muted/40 border border-border px-4 py-2 rounded-2xl">
            <div className="text-center pr-4 border-r border-border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">Questions</div>
              <div className="text-sm font-bold font-mono">{totalQuestions}</div>
            </div>
            <div className="text-center pr-4 border-r border-border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">Marks</div>
              <div className="text-sm font-bold font-mono text-emerald-500">{totalMarks}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">Duration</div>
              <div className="text-sm font-bold font-mono text-primary">{store.durationMinutes}m</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        
        {/* Basic Info */}
        <section className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" /> Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Title <span className="text-rose-500">*</span></label>
              <input type="text" value={store.title} onChange={e => store.setTitle(e.target.value)} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" placeholder="e.g. Frontend Engineering Test" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Exam Code <span className="text-rose-500">*</span></label>
              <input type="text" value={store.code} onChange={e => store.setCode(e.target.value.toUpperCase())} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm font-mono focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold">Description</label>
              <textarea rows={2} value={store.description} onChange={e => store.setDescription(e.target.value)} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" placeholder="Brief context about this assessment..." />
            </div>
          </div>
        </section>

        {/* Configuration */}
        <section className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Configuration & Proctoring
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 pb-5 border-b border-border">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Duration (min)</label>
              <input type="number" value={store.durationMinutes} onChange={e => store.setDurationMinutes(Number(e.target.value))} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Passing Marks</label>
              <input type="number" value={store.passingMarks} onChange={e => store.setPassingMarks(e.target.value ? Number(e.target.value) : '')} placeholder={`Auto: ${Math.ceil(totalMarks * 0.4)}`} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Attempts</label>
              <select value={store.allowedAttempts} onChange={e => store.setAllowedAttempts(Number(e.target.value))} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary">
                <option value={1}>1 Attempt</option>
                <option value={2}>2 Attempts</option>
                <option value={0}>Unlimited</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Category</label>
              <select value={store.category} onChange={e => store.setCategory(e.target.value)} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary">
                <option value="exam">Exam</option>
                <option value="quiz">Quiz</option>
                <option value="recruitment">Recruitment</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background cursor-pointer">
              <input type="checkbox" checked={store.proctoring.enforceFullscreen} onChange={e => store.setProctoring({ enforceFullscreen: e.target.checked })} className="rounded text-primary focus:ring-primary w-4 h-4" />
              <span className="text-sm font-semibold">Enforce Fullscreen</span>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background cursor-pointer">
              <input type="checkbox" checked={store.proctoring.blockCopyPaste} onChange={e => store.setProctoring({ blockCopyPaste: e.target.checked })} className="rounded text-primary focus:ring-primary w-4 h-4" />
              <span className="text-sm font-semibold">Block Copy/Paste</span>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background cursor-pointer">
              <input type="checkbox" checked={store.proctoring.detectTabSwitch} onChange={e => store.setProctoring({ detectTabSwitch: e.target.checked })} className="rounded text-primary focus:ring-primary w-4 h-4" />
              <span className="text-sm font-semibold">Detect Tab Switches</span>
            </label>
          </div>
        </section>

        {/* Sections */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" /> Assessment Sections
            </h2>
            <button onClick={store.addSection} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-lg text-xs font-semibold hover:bg-muted/80 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Section
            </button>
          </div>

          {store.sections.map((section, sIdx) => {
            const secMarks = section.questions.reduce((sum, q) => sum + (Number(q.marks)||1), 0);
            return (
              <div key={section.id} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 bg-muted/30 border-b border-border flex items-center justify-between">
                  <div className="flex-1 flex items-center gap-3">
                    <GripVertical className="w-5 h-5 text-muted-foreground cursor-grab" />
                    <input 
                      type="text" 
                      value={section.title} 
                      onChange={e => store.updateSection(section.id, { title: e.target.value })}
                      className="bg-transparent border-none text-base font-bold text-foreground focus:ring-0 p-0 w-64"
                    />
                    <span className="px-2 py-1 bg-background border border-border rounded-md text-[10px] font-bold text-muted-foreground uppercase">
                      {section.questions.length} Qs • {secMarks} Marks
                    </span>
                  </div>
                  <button onClick={() => {
                    if (confirm("Delete this section and all its questions?")) store.removeSection(section.id);
                  }} className="p-2 text-muted-foreground hover:text-rose-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="p-4 space-y-3">
                  {section.questions.length === 0 ? (
                    <div className="p-8 text-center bg-background border border-dashed border-border rounded-xl">
                      <p className="text-sm text-muted-foreground mb-3">No questions in this section yet.</p>
                      <button onClick={() => setActivePicker(section.id)} className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm">
                        + Select Questions from Bank
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {section.questions.map((q, qIdx) => (
                        <div key={q.questionId} className="flex flex-col sm:flex-row gap-4 p-3 bg-background border border-border rounded-xl group hover:border-primary/30 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded text-foreground uppercase border border-border">
                                {q.questionType}
                              </span>
                              <span className="text-xs font-semibold text-muted-foreground">Q{qIdx + 1}</span>
                            </div>
                            <p className="text-sm font-medium text-foreground line-clamp-1">{q.questionText}</p>
                          </div>
                          
                          <div className="flex items-center gap-3 sm:w-auto w-full border-t sm:border-t-0 pt-3 sm:pt-0 border-border">
                            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded-lg border border-border">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">Marks</span>
                              <input type="number" min={1} value={q.marks} onChange={e => store.updateQuestionConfig(section.id, q.questionId, { marks: Number(e.target.value) })} className="w-12 bg-transparent border-none text-xs font-mono font-bold text-emerald-500 focus:ring-0 p-0 text-center" />
                            </div>
                            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded-lg border border-border">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">Neg</span>
                              <input type="number" min={0} value={q.negativeMarks} onChange={e => store.updateQuestionConfig(section.id, q.questionId, { negativeMarks: Number(e.target.value) })} className="w-10 bg-transparent border-none text-xs font-mono font-bold text-rose-500 focus:ring-0 p-0 text-center" />
                            </div>
                            <button onClick={() => store.removeQuestionFromSection(section.id, q.questionId)} className="p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 rounded-md transition-colors ml-auto sm:ml-0">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2">
                        <button onClick={() => setActivePicker(section.id)} className="w-full py-3 border border-dashed border-border rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors flex items-center justify-center gap-2">
                          <Plus className="w-4 h-4" /> Add More Questions
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border px-6 py-3 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button onClick={() => router.push("/admin/assessments")} className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <div className="flex gap-3">
            <button onClick={() => handlePublish(editingId ? editingStatus : 'draft')} disabled={isPublishing} className="px-5 py-2.5 rounded-xl border border-border hover:bg-muted text-sm font-semibold flex items-center gap-2">
              <Save className="w-4 h-4" /> {editingId ? 'Save Changes' : 'Save as Draft'}
            </button>
            <button onClick={() => setShowConfirm(true)} disabled={isPublishing} className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold flex items-center gap-2 shadow-md">
              <CheckCircle2 className="w-4 h-4" /> {editingId ? "Publish Updates" : "Publish Assessment"}
            </button>
          </div>
        </div>
      </div>

      {activePicker && (
        <QuestionPicker sectionId={activePicker} onClose={() => setActivePicker(null)} />
      )}

      {/* Publish Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl animate-in zoom-in-95">
            <h2 className="text-xl font-bold mb-2 text-foreground">Confirm Publish</h2>
            <p className="text-sm text-muted-foreground mb-6">Are you sure you want to publish this assessment? It will immediately become available to assigned candidates.</p>
            
            <div className="space-y-3 bg-muted/40 p-4 rounded-xl border border-border mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sections</span>
                <span className="font-bold">{store.sections.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Questions</span>
                <span className="font-bold">{totalQuestions}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Marks</span>
                <span className="font-bold text-emerald-500">{totalMarks} pts</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold">Cancel</button>
              <button onClick={() => handlePublish('published')} disabled={isPublishing} className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                {isPublishing ? <Spinner className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
