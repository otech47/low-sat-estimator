const request = require('request-promise');

const BLOCKSTREAM_ESPLORA_URL = 'https://blockstream.info/api'

const json = request.defaults({
    json: true
});

const blockstream = module.exports = (function () {

    const fetch10Blocks = (params = {}) => {
        return new Promise((resolve, reject) => {
            json({
                method: 'GET',
                url: `${BLOCKSTREAM_ESPLORA_URL}/blocks/${params.height != null ? params.height : ''}`
            })
            .then(response => {
                resolve(response)
            })
        });
    };

    const fetch25TransactionsInBlock = (params = {}) => {
        return new Promise((resolve, reject) => {
            json({
                method: 'GET',
                url: `${BLOCKSTREAM_ESPLORA_URL}/block/${params.blockHash}/txs/${params.startIndex != null ? params.startIndex : ''}`
            })
            .then(response => {
                resolve(response)
            })
        });
    };

    return {
        fetch10Blocks,
        fetch25TransactionsInBlock
    };

})();