import { shallow, mount } from 'enzyme';
import { it, describe } from 'mocha';
import EventEmitter from 'events';
import RUM from '../index.js';
import assume from 'assume';
import React from 'react';

describe('RUM Component', function () {
  const events = new EventEmitter();
  let result;
  let rum;

  //
  // Fake the global.next
  //
  global.next = {
    emitter: new EventEmitter(),
    router: {
      asPath: '/',
      events: new EventEmitter()
    }
  };

  //
  // The Next event mitter isn't really an event emitter. So we have to confirm
  // their weird API.
  //
  global.next.emitter.off = global.next.emitter.removeListener;
  global.next.router.events.off = global.next.emitter.removeListener;

  /**
   * Simple proxy function, it will just emit the callback as events
   * so our test suite can just listen to the event emitter instead of
   * having to create new instances every single time.
   *
   * @private
   */
  function navigated() {
    events.emit('navigated', ...arguments);
  }

  /**
   * Emulate a request cycle.
   *
   * @param {String} path The path we navigate to
   * @param {Error} err Optional error that happend.
   * @private
   */
  function emulate(path, err) {
    const { emitter, router } = global.next;

    router.events.emit('routeChangeStart', path);

    /**
     * Completion callback.
     *
     * @private
     */
    function done() {
      setTimeout(function () {
        router.asPath = path;
        router.events.emit('routeChangeComplete', path);
      }, 5);
    }

    setTimeout(function () {
      const args = {
        Component: {},
        ErrorComponent: {},
        appProps: {
          Component: {},
          hash: '',
          router
        }
      };

      emitter.emit('before-reactdom-render', args);
      emitter.emit('after-reactdom-render', args);

      if (err) return setTimeout(function () {
        emitter.emit('before-reactdom-render', { err, ...args });
        emitter.emit('after-reactdom-render', { err, ...args });

        done();
      }, 10);

      done();
    }, 5);
  }

  function on() {
    result = mount(<RUM navigated={ navigated } />);
    rum = result.instance();
  }

  function off() {
    result.unmount();
  }

  it('adds eventlisteners to the next internals', function () {
    on();

    const emitter = global.next.emitter.eventNames();
    const router = global.next.router.events.eventNames();

    assume(emitter).includes('before-reactdom-render');
    assume(emitter).includes('after-reactdom-render');
    assume(router).includes('routeChangeStart');
    assume(router).includes('routeChangeComplete');

    assume(global.next.emitter.listeners('before-reactdom-render')[0]).equals(rum.before);
    assume(global.next.emitter.listeners('after-reactdom-render')[0]).equals(rum.after);
    assume(global.next.router.events.listeners('routeChangeStart')[0]).equals(rum.start);
    assume(global.next.router.events.listeners('routeChangeComplete')[0]).equals(rum.complete);

    off();
  });

  it('removes the listeners on unmount', function () {
    assume(global.next.emitter.listeners('before-reactdom-render')).is.length(0);
    assume(global.next.emitter.listeners('before-reactdom-render')).is.length(0);
    assume(global.next.emitter.listeners('after-reactdom-render')).is.length(0);
    assume(global.next.router.events.listeners('routeChangeStart')).is.length(0);
    assume(global.next.router.events.listeners('routeChangeComplete')).is.length(0);

    const enzyme = mount(<RUM navigated={ navigated } />);
    const instance = enzyme.instance();

    assume(global.next.emitter.listeners('before-reactdom-render')).is.length(1);
    assume(global.next.emitter.listeners('before-reactdom-render')).is.length(1);
    assume(global.next.emitter.listeners('after-reactdom-render')).is.length(1);
    assume(global.next.router.events.listeners('routeChangeStart')).is.length(1);
    assume(global.next.router.events.listeners('routeChangeComplete')).is.length(1);

    enzyme.unmount();

    assume(global.next.emitter.listeners('before-reactdom-render')).is.length(0);
    assume(global.next.emitter.listeners('before-reactdom-render')).is.length(0);
    assume(global.next.emitter.listeners('after-reactdom-render')).is.length(0);
    assume(global.next.router.events.listeners('routeChangeStart')).is.length(0);
    assume(global.next.router.events.listeners('routeChangeComplete')).is.length(0);
  });

  describe('Metric storage', function () {
    beforeEach(on);
    afterEach(off);

    it('it has a `timings` object', function () {
      assume(rum.timings).is.a('object');
      assume(rum.timings).is.length(0);
    });

    describe('#set', function () {
      it('stores the data in the `timings` object', function () {
        rum.set('foo');

        assume(rum.timings.foo).is.a('object');
        assume(rum.timings.foo.now).is.a('number');
        assume(rum.timings.foo.now).is.atmost(Date.now());
      });
    });

    describe('#get', function () {
      it('returns the data that was stored for a given event', function () {
        rum.set('example');
        rum.set('more-data', { extra: 'data', merged: 'with the object' });

        assume(rum.get('i do not exist')).is.a('undefined');
        assume(rum.get('example')).is.a('object');
        assume(rum.get('example')).equals(rum.timings.example);

        const data = rum.get('more-data');

        assume(data.now).is.a('number');
        assume(data.extra).equals('data');
        assume(data.merged).equals('with the object');
      });
    });

    describe('#reset', function () {
      it('resets the object', function () {
        rum.set('example');
        
        assume(rum.timings).is.above(0);
        rum.reset();

        assume(rum.timings).is.a('object');
        assume(rum.timings).is.length(0);
      });
    });
  });

  describe('render', function () {
    it('renders no output when used as standalone Component', function () {
      const result = shallow(
        <div>
          <h1>Hello world</h1>
          <RUM navigated={ navigated } />
        </div>
      );

      assume(result.html()).equals('<div><h1>Hello world</h1></div>');
    });

    it('returns children when wrapping a component', function () {
      const result = shallow(
        <RUM navigated={ navigated }>
          <h1>Hello world</h1>
        </RUM>
      );

      assume(result.html()).equals('<h1>Hello world</h1>');
    });
  });

  describe('#navigated', function () {
    beforeEach(on);
    afterEach(off);

    it('calls the callback when the page is navigated', function (next) {
      events.once('navigated', function (url, payload) {
        assume(url).equals('/callback-test');
        assume(payload).is.a('object');

        next();
      });

      emulate('/callback-test');
    });

    it('generates timing information', function (next) {
      const start = Date.now();

      events.once('navigated', function (url, payload) {
        const end = Date.now();

        assume(url).equals('/timing-data');
        assume(payload).is.a('object');

        Object.keys(payload).forEach(
          prop => assume(payload[prop]).is.a('number')
        );

        assume(payload.domLoading).is.within((start + 1), (end - 1));
        assume(payload.domInteractive).is.within((start + 1), (end - 1));
        assume(payload.domContentLoaded).is.within((start + 1), (end - 1));
        assume(payload.domComplete).is.within((start + 1), (end - 1));

        assume(payload.navigationStart).is.atleast(start);
        assume(payload.navigationStart).is.below(end);
        assume(payload.loadEventEnd).is.above(payload.navigationStart);

        next();
      });

      emulate('/timing-data');
    });
  });

  it('does not reset timing data on renderError', function (next) {
    on();

    events.once('navigated', function (url, payload) {
      assume(url).equals('/render-error');
      assume(payload).is.a('object');

      assume(payload.domComplete).is.above(payload.domLoading + 1);
      assume(payload.domInteractive).is.above(payload.domLoading + 1);
      assume(payload.domContentLoaded).is.above(payload.domLoading + 1);

      off();
      next();
    });

    emulate('/render-error', new Error('Shits on fire yo'));
  });
});
