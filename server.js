require('dotenv').config() 
var express = require('express');
var path = require('path');
var fs = require('fs');

var app = express();

var isProduction = process.env.NODE_ENV === 'production';
var port = isProduction ? process.env.PORT : 3000;

app.use(express.static(__dirname + '/public'));

app.get('*', function(req, res, next) {
    // Prevents an HTML response for API calls
    if (req.path.indexOf('/api/') != -1) {
        return next();
    }

    fs.readFile(__dirname + '/public/index.html', 'utf8', function(err, text) {
        res.send(text);
    });
});

app.get('*.bundle.js', function(req, res, next) {
    req.url += '.gz';
    res.set('Content-Encoding', 'gzip');
    next();
});

var cors = require('cors');

var whitelist = [
    'http://localhost:8080',
    'http://localhost:3000'
];
var corsOptions = {
    origin: function(origin, callback) {
        var originIsWhitelisted = whitelist.indexOf(origin) !== -1;
        callback(null, originIsWhitelisted);
    },
    credentials: true,
    methods: ['GET,PUT,POST,DELETE,OPTIONS'],
    allowedHeaders: ['Access-Control-Allow-Headers', 'Origin', 'Access-Control-Allow-Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Cache-Control']
};
app.use(cors(corsOptions));

const blockstream = require('./blockstream')

const LOW_FEE_THRESHOLD = 4;
const SAT_TO_USD_PRICE = 10000;

const fetchBlockData = () => {
    return new Promise((resolve, reject) => {
        blockstream.fetch10Blocks()
        .then(blocks => {

            // console.log('blocks')
            // console.log(blocks)

            const fetchTransactionsForBlock = ({ blockId, txCount }) => {
                return new Promise((resolve, reject) => {
                    const requestsToBeMade = Math.ceil(txCount / 25) + 1
                    const allTxns = []
                    console.log('Fetching transactions for block: ' + blockId)
                    console.log('Number of requests to be made ' + requestsToBeMade)
                    console.log('Fetching...')

                    Array(requestsToBeMade).fill(0).reduce((chain, a, i) => {

                        return chain.then(() => {
                            if (i < requestsToBeMade - 1) {
                                return (
                                    blockstream.fetch25TransactionsInBlock({
                                        blockHash: blockId,
                                        startIndex: i * 25
                                    })
                                    .then(transactions => {
                                        // console.log('Received transactions for block: ' + blockId + ' at index ' + i)
                                        allTxns.push.apply(allTxns, transactions)
                                    })
                                )
                            } else {
                                resolve(allTxns)
                            }
                        })
                    }, Promise.resolve())
                })
            }

            const allFeeReports = []

            const calculateFeeReportForBlock = (block) => {
                return new Promise((resolve, reject) => {
                    fetchTransactionsForBlock({
                        blockId: block.id,
                        txCount: block.tx_count
                    })
                    .then(allTxns => {
                        let lowSatPerByteCount = 0
                        let lowFeeTxnCount = 0

                        allTxns.map(t => {
                            // console.log(t)
                            if (t.fee == null) return

                            const feesPerByte = Math.ceil(t.fee / (t.weight / 4))

                            // console.log(feesPerByte)
                            
                            if (feesPerByte < LOW_FEE_THRESHOLD) {
                                // console.log('Low fee rate (< 5 sats/byte) found')
                                lowSatPerByteCount++
                            }
                            if (t.fee < SAT_TO_USD_PRICE) {
                                // console.log('Sub $1 txn found')
                                lowFeeTxnCount++
                            }
                        })

                        const reportMessage = (`\nIn Block ${block.id}\n${Math.floor(lowFeeTxnCount / block.tx_count * 100)}% of all txns (${lowFeeTxnCount} / ${block.tx_count}) were made with a total fee of < ~$1 (${SAT_TO_USD_PRICE} sats)\n${Math.floor(lowSatPerByteCount / block.tx_count * 100)}% of all txns (${lowSatPerByteCount} / ${block.tx_count}) were made with a fee rate of < ${LOW_FEE_THRESHOLD} sats/byte\n`)

                        console.log(reportMessage)

                        allFeeReports.push({
                            lowFeeTxnCount,
                            lowSatPerByteCount,
                            blockId: block.id,
                            txnCount: block.tx_count,
                        })
                        resolve()
                    })
                })
            }
            // Uncomment to analyze only the 1st block returned in the set
            // blocks = [blocks[0]]

            return blocks.reduce((chain, b, i) => {
                return chain.then(() => {
                    if (i < blocks.length - 1) {
                        return calculateFeeReportForBlock(b)
                    } else {
                        return calculateFeeReportForBlock(b).then(() => resolve(allFeeReports))
                    }
                })
            }, Promise.resolve())
        })
    })
}

app.get('/api/fetchBlockData', (req, res) => {

    fetchBlockData()
    .then(blocks => {
        res.json({
            payload: blocks
        })
    })
    
})

app.listen(port, function() {
    console.log('Server running on port ' + port);
    fetchBlockData()
    .then(allFeeReports => {
        let totalTxnCount = 0
        let totalLowFeeTxnCount = 0
        let totalLowSatPerByteCount = 0

        allFeeReports.map(fr => {
            totalTxnCount += fr.txnCount
            totalLowFeeTxnCount += fr.lowFeeTxnCount
            totalLowSatPerByteCount += fr.lowSatPerByteCount
        })

        console.log(`\nIn the last 10 blocks,\n${Math.floor(totalLowFeeTxnCount / totalTxnCount * 100)}% of all txns were made with a total fee of < ~$1 ($1 = ${SAT_TO_USD_PRICE} sats)\n${Math.floor(totalLowSatPerByteCount / totalTxnCount * 100)}% of all txns (${totalLowSatPerByteCount} / ${totalTxnCount}) were made with a fee rate of < ${LOW_FEE_THRESHOLD} sats/byte`)
    })
});