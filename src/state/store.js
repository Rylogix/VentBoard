export function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  const getState = () => state;

  const setState = (updater) => {
    const nextState = typeof updater === "function" ? updater(state) : { ...state, ...updater };
    state = nextState;
    listeners.forEach((listener) => listener(state));
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  };

  return { getState, setState, subscribe };
}
