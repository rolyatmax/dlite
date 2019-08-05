# dlite
deck.gl, but lighter

```bash
$ npm i && npm start
```

### To do
 - [x] ship a smaller dataset with the demo
 - [ ] incorporate animation in demo
 - [ ] consider using deck's map controller instead of mapbox because mapbox has such a lag it causes the two canvas to go out of sync
 - [ ] figure out where `altitude` comes from in web-mercator-projection stuff
 - [ ] implement vertexArray updates on render()
 - [ ] implement framebuffer support
 - [ ] make camera uniforms a uniform block?
 - [ ] support transform feedback
 - [ ] support instancing
 - [ ] support gl parameters updates (blend modes)
 - [ ] return project/unproject fns
