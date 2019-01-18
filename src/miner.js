const crypto = require('crypto')
const rp = require('request-promise');
const $ = require('cheerio');

const dynamoDb = require('./utils/dynamodb')

const md5 = str => crypto.createHash('md5').update(str).digest('hex')

const baseURL = 'https://www.goodreads.com/quotes?format=json'

const quotesUrl = page => `${baseURL}&page=${page}`

module.exports.mineQuotes = (page) =>
new Promise((resolve, reject) => {
  rp(quotesUrl(page))
    .then(data => JSON.parse(data).content_html)
    .then(html => {
      const quotes = []
      const quoteGroup = $('.quote', html)

      quoteGroup.each((idx, elem) => {
        const quoteElement = $(elem)
        const text = quoteElement.find('.quoteBody').text().replace(/^\s+|\s+$/g, "")
        const author = quoteElement.find('.quoteAuthor').text().replace(/^\s+|\s+$/g, "")
        const likes = parseInt(quoteElement.find('.likesCount').text().replace(/^\s+|\s+$/g, ""))
        const tags = quoteElement.find('.quoteTags')
          .find('a')
          .map((idx, tag) => {
            const tagSelector = $(tag)
            return {
              link: tagSelector.attr('href'),
              text: tagSelector.text().replace(/^\s+|\s+$/g, "")
            }
          }).toArray()

        quotes.push({
          text,
          author,
          likes,
          tags
        })
      })
      return quotes
    })
    .then(quotes => {
      // save to db
      return quotes.reduce((chain, quote) =>
        chain.then(acc => 
          {
          const id = md5(`${quote.author}-${quote.text}`)
          const params = {
            TableName: process.env.DYNAMODB_TABLE,
            Item: {
              ...quote,
              id,
            }
          }
          return Promise.resolve(
            new Promise((resolve, reject) => {
              dynamoDb.put(params, (error, data) => {
                if (error) {
                  reject(error)
                } else {
                  resolve(data)
                }
              })
            })
          )
            .then(data => {
              const tmp = acc.success.concat([data])
              acc.success = tmp
              return acc
            })
            .catch(err => {
              const tmp = acc.failures.concat([err])
              acc.failures = tmp
              return acc
            })
        }),
        Promise.resolve({
          success: [],
          failures: []
        })
      )
    })
    .then(response => {
      resolve(response)
    })
    .catch(function(err) {
      reject(err)
    });
})
