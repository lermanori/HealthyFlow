import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Utensils, Plus, Trash2, Pencil, X, Check, Sparkles } from 'lucide-react'
import { useCalorieEntries } from '../hooks/useCalorieEntries'
import { CalorieEntry, CalorieEntryInput } from '../services/api'
import MealAnalyzer from '../components/MealAnalyzer'

const todayStr = () => new Date().toISOString().slice(0, 10)

type FormState = {
  name: string
  calories: string
  protein: string
  carbs: string
  fat: string
  quantity: string
}

const emptyForm: FormState = { name: '', calories: '', protein: '', carbs: '', fat: '', quantity: '' }

function formToInput(date: string, form: FormState): CalorieEntryInput {
  return {
    date,
    name: form.name.trim(),
    calories: Number(form.calories),
    protein: form.protein === '' ? null : Number(form.protein),
    carbs: form.carbs === '' ? null : Number(form.carbs),
    fat: form.fat === '' ? null : Number(form.fat),
    quantity: form.quantity.trim() === '' ? null : form.quantity.trim(),
  }
}

function entryToForm(e: CalorieEntry): FormState {
  return {
    name: e.name,
    calories: String(e.calories),
    protein: e.protein != null ? String(e.protein) : '',
    carbs: e.carbs != null ? String(e.carbs) : '',
    fat: e.fat != null ? String(e.fat) : '',
    quantity: e.quantity ?? '',
  }
}

export default function CaloriesPage() {
  const [date, setDate] = useState(todayStr())
  const { entries, isLoading, totals, createEntry, updateEntry, deleteEntry } = useCalorieEntries(date)
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(emptyForm)
  const [showAiAnalyzer, setShowAiAnalyzer] = useState(false)

  const submitAdd = () => {
    if (!addForm.name.trim() || addForm.calories === '') return
    createEntry(formToInput(date, addForm))
    setAddForm(emptyForm)
    setAdding(false)
  }

  const startEdit = (e: CalorieEntry) => {
    setEditingId(e.id)
    setEditForm(entryToForm(e))
  }

  const submitEdit = () => {
    if (!editingId) return
    updateEntry({ id: editingId, patch: formToInput(date, editForm) })
    setEditingId(null)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-28 md:pb-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
            <Utensils className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-100 neon-text">Calorie Log</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="input-field w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
            onClick={() => setShowAiAnalyzer(true)}
          >
            <Sparkles className="w-4 h-4" /> Add with AI
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showAiAnalyzer && (
          <MealAnalyzer date={date} onClose={() => setShowAiAnalyzer(false)} />
        )}
      </AnimatePresence>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">Entries</h2>
          <button className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> Add Entry
          </button>
        </div>

        {isLoading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="py-2 pr-2">Name</th>
                  <th className="py-2 pr-2">Qty</th>
                  <th className="py-2 pr-2">Cal</th>
                  <th className="py-2 pr-2">P</th>
                  <th className="py-2 pr-2">C</th>
                  <th className="py-2 pr-2">F</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e: CalorieEntry) =>
                  editingId === e.id ? (
                    <tr key={e.id} className="border-b border-gray-800">
                      <td className="py-2 pr-2"><input className="input-field" value={editForm.name} onChange={(ev) => setEditForm({ ...editForm, name: ev.target.value })} /></td>
                      <td className="py-2 pr-2"><input className="input-field" value={editForm.quantity} onChange={(ev) => setEditForm({ ...editForm, quantity: ev.target.value })} /></td>
                      <td className="py-2 pr-2"><input type="number" className="input-field w-20" value={editForm.calories} onChange={(ev) => setEditForm({ ...editForm, calories: ev.target.value })} /></td>
                      <td className="py-2 pr-2"><input type="number" className="input-field w-16" value={editForm.protein} onChange={(ev) => setEditForm({ ...editForm, protein: ev.target.value })} /></td>
                      <td className="py-2 pr-2"><input type="number" className="input-field w-16" value={editForm.carbs} onChange={(ev) => setEditForm({ ...editForm, carbs: ev.target.value })} /></td>
                      <td className="py-2 pr-2"><input type="number" className="input-field w-16" value={editForm.fat} onChange={(ev) => setEditForm({ ...editForm, fat: ev.target.value })} /></td>
                      <td className="py-2 flex gap-2">
                        <button onClick={submitEdit} className="text-cyan-400"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={e.id} className="border-b border-gray-800 text-gray-200">
                      <td className="py-2 pr-2">{e.name}</td>
                      <td className="py-2 pr-2 text-gray-400">{e.quantity ?? '—'}</td>
                      <td className="py-2 pr-2">{e.calories}</td>
                      <td className="py-2 pr-2 text-gray-400">{e.protein ?? '—'}</td>
                      <td className="py-2 pr-2 text-gray-400">{e.carbs ?? '—'}</td>
                      <td className="py-2 pr-2 text-gray-400">{e.fat ?? '—'}</td>
                      <td className="py-2 flex gap-2">
                        <button onClick={() => startEdit(e)} className="text-gray-400 hover:text-cyan-400"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => deleteEntry(e.id)} className="text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  )
                )}

                {adding && (
                  <tr className="border-b border-gray-800">
                    <td className="py-2 pr-2"><input className="input-field" placeholder="Name" value={addForm.name} onChange={(ev) => setAddForm({ ...addForm, name: ev.target.value })} /></td>
                    <td className="py-2 pr-2"><input className="input-field" placeholder="e.g. 2 eggs" value={addForm.quantity} onChange={(ev) => setAddForm({ ...addForm, quantity: ev.target.value })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="input-field w-20" placeholder="Cal" value={addForm.calories} onChange={(ev) => setAddForm({ ...addForm, calories: ev.target.value })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="input-field w-16" placeholder="P" value={addForm.protein} onChange={(ev) => setAddForm({ ...addForm, protein: ev.target.value })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="input-field w-16" placeholder="C" value={addForm.carbs} onChange={(ev) => setAddForm({ ...addForm, carbs: ev.target.value })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="input-field w-16" placeholder="F" value={addForm.fat} onChange={(ev) => setAddForm({ ...addForm, fat: ev.target.value })} /></td>
                    <td className="py-2 flex gap-2">
                      <button onClick={submitAdd} className="text-cyan-400"><Check className="w-4 h-4" /></button>
                      <button onClick={() => { setAdding(false); setAddForm(emptyForm) }} className="text-gray-400"><X className="w-4 h-4" /></button>
                    </td>
                  </tr>
                )}

                {entries.length === 0 && !adding && (
                  <tr><td colSpan={7} className="py-6 text-center text-gray-500">No entries for this day yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Daily Totals</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-cyan-400">{totals.calories}</p>
            <p className="text-xs text-gray-400">Calories</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-100">{totals.protein}g</p>
            <p className="text-xs text-gray-400">Protein</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-100">{totals.carbs}g</p>
            <p className="text-xs text-gray-400">Carbs</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-100">{totals.fat}g</p>
            <p className="text-xs text-gray-400">Fat</p>
          </div>
        </div>
      </div>
    </div>
  )
}
