/* global fetch */

const { GUI } = require('dat.gui')
const { createDlite } = require('./create-dlite')
const createLoopToggle = require('./helpers/create-loop')
const { createSpring } = require('spring-animator')

const MAPBOX_TOKEN = require('./mapbox-token')

const DATA_PATH = 'data/sample.binary'

const dlite = createDlite(MAPBOX_TOKEN, {
  center: [-122.423175, 37.778316],
  zoom: 14,
  bearing: 0,
  pitch: 15
})

const settings = {
  opacity: 1,
  tripsCount: 100000,
  radius: 5,
  height: 0,
  stiffness: 0.03,
  damping: 0.23
}

window.dlite = dlite

fetch(DATA_PATH)
  .then(res => res.arrayBuffer())
  .then(data => {
    const trips = getTripsFromBinary(data).filter(t => t.occupied)
    console.log(trips.slice(0, 10))

    const toggleLoop = createLoopToggle(render)
    dlite.onload.then(toggleLoop)

    const gui = new GUI()
    gui.add(settings, 'tripsCount', 1, trips.length).step(1)
    gui.add(settings, 'radius', 1, 60)
    gui.add(settings, 'opacity', 0, 1).step(0.01)
    gui.add(settings, 'height', 0, 100)
    gui.add(settings, 'stiffness', 0.001, 0.1).step(0.001)
    gui.add(settings, 'damping', 0.01, 0.5).step(0.01)

    const heightSpring = createSpring(0.001, 0.03, 0)

    const vertexArray = dlite.picoApp.createVertexArray()
    const positions = dlite.picoApp.createVertexBuffer(dlite.PicoGL.FLOAT, 2, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]))
    const iPositions = dlite.picoApp.createVertexBuffer(dlite.PicoGL.FLOAT, 2, getPositions(trips))
    const iHours = dlite.picoApp.createVertexBuffer(dlite.PicoGL.FLOAT, 1, getHours(trips))
    vertexArray.vertexAttributeBuffer(0, positions)
    vertexArray.instanceAttributeBuffer(1, iPositions)
    vertexArray.instanceAttributeBuffer(2, iHours)

    const renderPoints = dlite({
      vs: `#version 300 es
      precision highp float;
      layout(location=0) in vec2 position;
      layout(location=1) in vec2 iPosition;
      layout(location=2) in float iHour;
      uniform float size;
      uniform float height;
      out vec3 vColor;
      out vec2 vUnitPosition;

      #define BLUE vec3(44, 80, 156)
      #define YELLOW vec3(244, 249, 199)

      void main() {
        float t;
        if (iHour > 12.0) {
          t = 1.0 - (iHour - 12.0) / 12.0;
        } else {
          t = iHour / 12.0;
        }
        
        // position on the containing square in [-1, 1] space
        vUnitPosition = position.xy;

        vColor = mix(BLUE, YELLOW, t) / 255.0;

        vec3 pos = vec3(iPosition, iHour * height);
        vec3 offset = vec3(position, 0.0) * size * pixelsPerMeter;
        vec4 worldPos = pico_mercator_lngLatToWorld(pos);
        gl_Position = pico_mercator_worldToClip(vec4(worldPos.xyz + offset, worldPos.w));
      }`,

      fs: `#version 300 es
      precision highp float;
      in vec3 vColor;
      in vec2 vUnitPosition;
      uniform float opacity;
      out vec4 fragColor;
      void main() {
        float dist = length(vUnitPosition);
        float aaAlpha = 1.0 - smoothstep(0.999, 1.001, dist);
        if (dist > 1.0) {
          discard;
        }
        fragColor = vec4(vColor, opacity * aaAlpha);
      }`,

      vertexArray: vertexArray,
      blend: {
        csrc: dlite.PicoGL.SRC_ALPHA,
        cdest: dlite.PicoGL.ONE_MINUS_SRC_ALPHA,
        asrc: dlite.PicoGL.ONE,
        adest: dlite.PicoGL.ONE
      }
    })

    function render (t) {
      heightSpring.setDestination(settings.height)
      heightSpring.tick(settings.stiffness, settings.damping)
      const height = heightSpring.getCurrentValue()

      dlite.clear(0, 0, 0, 0)
      renderPoints({
        count: 4,
        instanceCount: settings.tripsCount,
        primitive: dlite.PicoGL.TRIANGLE_FAN,
        uniforms: {
          height: height,
          size: settings.radius,
          opacity: settings.opacity
        }
      })
    }
  })

// Trip Binary data: 32FloatArray with the following values
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

function getHours (trips) {
  const hoursData = new Float32Array(trips.length)
  let i = 0
  while (i < trips.length) {
    hoursData[i] = trips[i].minutesOfDay / 60
    i += 1
  }
  return hoursData
}
