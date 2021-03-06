const express = require('express');
const bodyParser = require('body-parser');
const passport = require('passport');

const { User } = require('./models');

const router = express.Router();

const jsonParser = bodyParser.json();
const urlencodedParser = bodyParser.urlencoded({ extended: false });

// Post endpoint to register a new user
router.post('/register', jsonParser, urlencodedParser, (req, res) => {
  const requiredFields = ['username', 'password', 'role'];
  const missingField = requiredFields.find(field => !(field in req.body));

  if (missingField) {
    return res.status(422).json({
      code: 422,
      reason: 'ValidationError',
      message: 'Missing field',
      location: missingField
    });
  }

  const stringFields = ['username', 'password', 'role'];
  const nonStringField = stringFields.find(field =>
    (field in req.body) && typeof req.body[field] !== 'string'
  );

  if (nonStringField) {
    return res.status(422).json({
      code: 422,
      reason: 'ValidationError',
      message: 'Incorrect field type: expected string',
      location: nonStringField
    });
  }

  // If the username and password aren't trimmed send an error. Users might
  // expect that these will work without trimming (i.e. they want the password
  // "foobar ", including the space at the end).  We need to reject such values
  // explicitly so the users know what's happening, rather than silently
  // trimming them and expecting the user to understand.
  // We'll silently trim the other fields, because they aren't credentials used
  // to log in, so it's less of a problem.
  const explicityTrimmedFields = ['username', 'password'];
  const nonTrimmedField = explicityTrimmedFields.find(field =>
    req.body[field].trim() !== req.body[field]
  );

  if (nonTrimmedField) {

    let errorReason = 'Validation Error';
    let errorMessage = 'Username and password cannot start or end with whitespace';

    req.flash('error_msg', `${errorReason}: ${errorMessage}`);
    res.redirect('../register');

    return res.status(422).json({
      code: 422,
      reason: 'ValidationError',
      message: 'Cannot start or end with whitespace',
      location: nonTrimmedField
    });
  }

  const sizedFields = {
    username: {
      min: 1
    },
    password: {
      min: 8,
      // bcrypt truncates after 72 characters
      max: 72
    }
  };
  const tooSmallField = Object.keys(sizedFields).find(field =>
    'min' in sizedFields[field] &&
    req.body[field].trim().length < sizedFields[field].min
  );
  const tooLargeField = Object.keys(sizedFields).find(field =>
    'max' in sizedFields[field] &&
    req.body[field].trim().length > sizedFields[field].max
  );

  if (tooSmallField || tooLargeField) {

    let errorReason = 'Validation Error';
    let errorMessage = tooSmallField ?
      `Password must be at least ${sizedFields[tooSmallField].min} characters long` :
      `Password cannot be greater than ${sizedFields[tooLargeField].max} characters long`;

    req.flash('error_msg', `${errorReason}: ${errorMessage}`);
    res.redirect('../register');

    return res.status(422).json({
      code: 422,
      reason: 'ValidationError',
      message: tooSmallField ?
        `Must be at least ${sizedFields[tooSmallField].min} characters long` :
        `Must be at most ${sizedFields[tooLargeField].max} characters long`,
      location: tooSmallField || tooLargeField
    });
  }

  let { username, password, role } = req.body;

  return User
    .find({ username })
    .count()
    .then(count => {
      if (count > 0) {
        // check for existing user with the same username
        return Promise.reject({
          code: 422,
          reason: 'ValidationError',
          message: 'Username already taken',
          location: 'username'
        });
      }
      // if username doesnt exist, hash the password
      return User.hashPassword(password)
    })
    .then(hash => {
      return User
        .create({
          username,
          password: hash,
          role
        })
    })
    .then(user => {
      // return res.status(201).json(user.apiRepr());
      req.flash('success_msg', 'You have successfully registered. You can login now.');
      res.redirect('../auth/login');
    })
    .catch(err => {
      // Forward validation errors on to the client, otherwise give a 500
      // error because something unexpected has happened
      if (err.reason === 'ValidationError') {
        req.flash('error_msg', 'Username already taken. Try again.');
        res.redirect('../register');
      }
      res.status(500).json({ code: 500, message: err.stack });
    });
});

module.exports = { router };