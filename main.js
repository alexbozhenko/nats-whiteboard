import './style.css'
import Alpine from "alpinejs";
import throttle from './throttle';
import { wsconnect, headers } from '@nats-io/nats-core';
import { jetstream } from "@nats-io/jetstream";

Alpine.data("whiteboard", (subject) => ({
  id: Math.random().toString(36).slice(2, 10),
  color: "black",
  thickness: 5,
  drawing: false,
  last: { x: 0, y: 0 },
  context: null,
  nats: null,

  async init() {
    const server = "ws://" + window.location.hostname + ":9222"
    this.nats = await wsconnect({ servers: server })

    const stream = "whiteboard";
    const js = jetstream(this.nats);
    const orderedConsumer = await js.consumers.get(stream);
    const sub = await orderedConsumer.consume();

    for await (const m of sub) {
      const data = m.json()
      switch (data.type) {
        case "draw":
          if (data.id !== this.id) {
            this.drawRaw(data)
          }
          break;
        case "clear":
          this.context.clearRect(0, 0, window.innerWidth, window.innerHeight)
        default:
          break;
      }
    }
  },

  sizeCanvas(canvas) {
    this.context = canvas.getContext("2d")
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  },

  startDrawing(e) {
    this.drawing = true
    this.last = this.getPoint(e)
  },

  draw(e) {
    throttle(() => {
      const from = this.last
      const to = this.getPoint(e)
      const msg = {
        id: this.id,
        type: "draw",
        from: from,
        to: to,
        thickness: this.thickness,
        color: this.color
      }

      this.drawRaw(msg)
      this.nats.publish(subject, JSON.stringify(msg))

      this.last = to
    }, 30)()
  },

  getPoint(e) {
    if (!e.offsetX || !e.offsetY) {
      const rect = e.target.getBoundingClientRect()
      e.offsetX = (e.touches[0].clientX - window.pageXOffset - rect.left)
      e.offsetY = (e.touches[0].clientY - window.pageYOffset - rect.top)
    }
    return { x: e.offsetX, y: e.offsetY }
  },

  clear() {
    const msg = { id: this.id, type: "clear", }
    const h = headers()
    h.set("Nats-Rollup", "sub")
    this.nats.publish(subject, JSON.stringify(msg), { headers: h })
  },

  drawRaw({ from, to, thickness, color }) {
    const c = this.context
    c.beginPath()
    c.lineWidth = thickness
    c.lineCap = "round"
    c.lineJoin = "round"
    c.strokeStyle = color
    c.moveTo(from.x, from.y)
    c.lineTo(to.x, to.y)
    c.stroke()
  },
}))

Alpine.start()
