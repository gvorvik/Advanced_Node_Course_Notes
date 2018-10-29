const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');

const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);

client.hget = util.promisify(client.hget);


const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function(options = {}) {
    this.useCache = true;
    this.hashKey = JSON.stringify(options.key || '');
    //makes function chainable
    return this;
}

mongoose.Query.prototype.exec = async function() {

    if(!this.useCache) {
        return exec.apply(this, arguments);
    }

    const key = JSON.stringify(Object.assign({}, this.getQuery(), {
        collection: this.mongooseCollection.name
    }));

    //See if we have value for key in redis
    const cachedValue = await client.hget(this.hashKey, key)

    //if yes, return that
    if(cachedValue) {
        const doc = JSON.parse(cachedValue);
        return Array.isArray(doc) 
            ?  doc.map(doc => new this.model(doc))
            : new this.model(doc)
    }

    //if no, go to database
    const result = await exec.apply(this, arguments);

    //set timer on clearing cache
    client.hset(this.hashKey, key, JSON.stringify(result), 'EX', 10);

    console.log(result);
}

module.exports = {
    clearHash(hashKey) {
        return client.del(JSON.stringify(hashKey));
    }
}