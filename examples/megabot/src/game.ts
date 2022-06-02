import './app.css'
import * as ex from 'excalibur'
import { Color, WebAudio, Input } from 'excalibur'

// export const loader = new ex.Loader()

const game = new ex.Engine({
  canvasElementId: 'game',
  // width: 400,
  // height: 225,
  displayMode: ex.DisplayMode.FitScreen,
  backgroundColor: Color.Black,
  pointerScope: Input.PointerScope.Canvas,
  viewport: { width: 400, height: 225 },
})

window.addEventListener('pointerdown', () => {
  WebAudio.unlock()
})

// enforce ui stays at same resolution and scales up/down
function updateUi() {
  const ui = document.querySelector<HTMLElement>('#ui')

  if (ui) {
    const { width, height } = game.canvas.getBoundingClientRect()
    const scaledWidth = width / game.drawWidth
    const scaledHeight = height / game.drawHeight

    ui.style.width = `${game.drawWidth}px`
    ui.style.height = `${game.drawHeight}px`

    ui.style.transformOrigin = '0 0'
    ui.style.transform = `scale(${scaledWidth}, ${scaledHeight})`
  }
}

setTimeout(() => updateUi())
window.addEventListener('resize', () => {
  updateUi()
})

export default game
