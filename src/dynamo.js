const axios = require('axios').default
const config = require('./config')
const render = require('./render')

const createInstance = (baseURL, token) => {
  const instance = axios.create({
    baseURL,
    timeout: 10000,
    headers: {
      Authorization: `token ${token}`
    }
  });

  instance.interceptors.response.use(resp => resp, err => {
    render.errorHttpRequest(err.message);
    return Promise.reject(err);
  });

  return instance;
}

module.exports = {
  createInstance
}

// const ins = createInstance('https://pfqxxox5kg.execute-api.ap-southeast-1.amazonaws.com/production', 'u6WBbWD7xRVrLVua')

// ins.put('/api/test/hehe', {
//   name: 1
// })
//   .then(res => console.log(res.data))
