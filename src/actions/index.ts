/* eslint-disable @typescript-eslint/no-explicit-any */

import labActions from './labs';
import storeActions from './store';

const actions = { ...labActions, ...storeActions };
export default actions;
