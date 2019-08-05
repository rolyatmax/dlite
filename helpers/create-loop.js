/* global requestAnimationFrame cancelAnimationFrame */

module.exports = function createLoopToggle (fn) {
  let stopLoop = null
  return () => {
    if (stopLoop) {
      stopLoop()
      stopLoop = null
    } else {
      stopLoop = startLoop(fn)
    }
  }
}

function startLoop (render) {
  let rAFToken
  function loop (t) {
    rAFToken = requestAnimationFrame(loop)
    render(t)
  }
  rAFToken = requestAnimationFrame(loop)
  return function stopLoop () {
    cancelAnimationFrame(rAFToken)
  }
}
