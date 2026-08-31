type Tone = 'neutral' | 'alert' | 'success'

interface ToastItem {
  id: number
  text: string
  tone: Tone
}

class Toasts {
  items = $state<ToastItem[]>([])
  private seq = 0

  show(text: string, tone: Tone = 'neutral', ms = 2600): void {
    const id = ++this.seq
    this.items = [...this.items, {id, text, tone}]
    setTimeout(() => this.dismiss(id), ms)
  }
  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id)
  }
}

export const toasts = new Toasts()
