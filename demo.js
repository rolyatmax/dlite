/* global fetch */

const { GUI } = require('dat.gui')
const createDlite = require('./create-dlite')
const createLoopToggle = require('./helpers/create-loop')

const MAPBOX_TOKEN = require('./mapbox-token')

const DATA_PATH = 'data/cabspotting.binary'

// OUTPUTS: 32FloatArray with the following values
// cab id
// trajectory length
// pt1 minutesOfWeek
// pt1 occupied (boolean)
// pt1 longitude
// pt1 latitude
// pt2 minutesOfWeek
// pt2 occupied
// pt2 longitude
// pt2 latitude

const CENTER = [-122.423175, 37.778316]
const ZOOM = 14
const BEARING = 0
const PITCH = 15

const dlite = createDlite(MAPBOX_TOKEN, {
  center: CENTER,
  zoom: ZOOM,
  bearing: BEARING,
  pitch: PITCH
})

const settings = {
  opacity: 1,
  tripsCount: 100000,
  radius: 5,
  color: 'timeOfDay',
  tripSampleRate: 1
}

window.dlite = dlite

fetch(DATA_PATH)
  .then(res => res.arrayBuffer())
  .then(data => {
    const trips = getTripsFromBinary(data).filter(t => t.occupied && Math.random() < settings.tripSampleRate)

    console.log(trips.slice(0, 10))

    const toggleLoop = createLoopToggle(render)

    const gui = new GUI()
    gui.add(settings, 'tripsCount', 1, trips.length).step(1)
    gui.add(settings, 'radius', 1, 60)

    dlite.onload.then(toggleLoop)

    const vertexArray = dlite.pico.createVertexArray()
    const positions = dlite.pico.createVertexBuffer(dlite.pico.gl.FLOAT, 2, getPositions(trips))
    vertexArray.vertexAttributeBuffer(0, positions)

    const renderPoints = dlite({
      vs: `#version 300 es
      precision highp float;
      layout(location=0) in vec2 position;
      uniform float size;
      void main() {
        vec3 pos = vec3(position, 0.0);
        vec3 offset = vec3(0.0);
        gl_Position = project_position_to_clipspace(pos, offset);
        gl_PointSize = project_size(size);
      }`,

      fs: `#version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() {
        fragColor = vec4(0.5, 0.7, 0.9, 1.0);
      }`,

      vertexArray: vertexArray,
      primitive: dlite.pico.gl.POINTS,
      count: settings.tripsCount,
      uniforms: { size: settings.radius }
    })

    function render (t) {
      dlite.clear(0, 0, 0, 0)
      renderPoints({
        count: settings.tripsCount,
        primitive: dlite.pico.gl.POINTS,
        uniforms: { size: settings.radius }
      })
    }
  })

function getTripsFromBinary (binaryData) {
  const floats = new Float32Array(binaryData)
  const trips = []
  let j = 0
  while (j < floats.length) {
    const id = floats[j++]
    const pathLength = floats[j++]
    const pathData = new Float32Array(floats.buffer, j * 4, pathLength * 4)
    for (let i = 0; i < pathData.length; i += 4) {
      const position = new Float32Array(floats.buffer, (j + i + 2) * 4, 2)
      const occupied = floats[j + i + 1] === 1
      const minutesOfWeek = floats[j + i]
      const minutesOfDay = minutesOfWeek % (24 * 60)
      const isWeekday = minutesOfWeek < 5 * 24 * 60

      let lastTrip = trips[trips.length - 1]
      if (!trips.length || lastTrip.cabId !== id || lastTrip.occupied !== occupied) {
        lastTrip = { cabId: id, path: [], occupied, minutesOfDay, isWeekday }
        trips.push(lastTrip)
      }
      lastTrip.path.push(position)
    }
    j += pathLength * 4
  }
  return trips
}

function getPositions (trips) {
  const positionsData = new Float32Array(trips.length * 2)
  let i = 0
  for (const trip of trips) {
    positionsData[i++] = trip.path[0][0]
    positionsData[i++] = trip.path[0][1]
  }
  return positionsData
}
