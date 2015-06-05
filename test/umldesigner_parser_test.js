'use strict';

var chai = require('chai'),
    expect = chai.expect,
    mp = require('../editors/umldesigner_parser'),
    xml2js = require('xml2js'),
    fs = require('fs'),
    types = require('../types');

var parser = new mp.UMLDesignerParser(
  getRootElement(readFileContent('./test/xmi/umldesigner.uml')),
  initDatabaseTypeHolder('sql'));

describe('UMLDesignerParser', function() {
  describe('#findElements',function() {
    before(function() {
      parser.findElements();
    });

    it('finds the classes in the document', function() {
      expect(
        parser.rawClassesIndexes
      ).to.deep.equal([ 0, 3, 5, 7, 12, 14, 15, 17, 19 ]);
    });

    it('finds the types in the document', function() {
      expect(
        parser.rawTypesIndexes
      ).to.deep.equal([ 1, 2 ]);
    });

    it('finds the associations in the document', function() {
      expect(
        parser.rawAssociationsIndexes
      ).to.deep.equal([ 4, 6, 8, 9, 10, 11, 13, 16, 18, 20 ]);
    });
  });

  describe('#findConstraints', function() {
    // not supported by the editor yet
  });

  describe('#fillTypes', function() {
    // we need this var to roll back to the previous state after the test.
    var previousTypes = parser.databaseTypes.types;

    describe('when the types do not have a type from the XMI', function() {
      before(function() {
        parser.databaseTypes.types = {};
      });

      after(function() {
        parser.databaseTypes.types = previousTypes;
      });

      it('throws an exception', function() {
        try {
          parser.fillTypes();
          throw new ExpectationError();
        } catch (error) {
          expect(error.name).to.equal('InvalidTypeException');
        }
      });
    });

    describe('when types have the types from the XMI', function() {
      before(function() {
        parser.fillTypes();
      });

      it('assigns their id with their capitalized name', function() {
        var expectedTypes = [ 'DateTime', 'BigDecimal' ];
        for(var element in parser.getTypes()) {
          expect(
            expectedTypes
          ).to.include(parser.getTypes()[element]);
          expectedTypes.splice(
            expectedTypes.indexOf(parser.getTypes()[element]), 1);
        }
        expect(expectedTypes.length).to.equal(0);
      });
    });

    describe('if the types are not capitalized', function() {
      it('capitalizes and adds them', function() {
        var otherParser =  new mp.UMLDesignerParser(
          getRootElement(
            readFileContent('./test/xmi/umldesigner_lowercased_string_type.xmi')),
          initDatabaseTypeHolder('sql'));
        otherParser.fillTypes();
        Object.keys(otherParser.getTypes()).forEach(function(type) {
          expect(
            otherParser.getTypes()[type].name
          ).to.equal(_.capitalize(otherParser.getTypes()[type].name));
        });
      });
    });
  });

  describe('#fillClassesAndFields', function() {
    before(function() {
      parser.fillClassesAndFields();
    });

    describe('when a class has no name', function() {
      it('throws an exception', function() {
        var otherParser = new mp.UMLDesignerParser(
            getRootElement(
              readFileContent('./test/xmi/umldesigner_no_class_name_test.uml')),
            initDatabaseTypeHolder('sql'));
        otherParser.findElements();
        try {
          otherParser.fillClassesAndFields();
          throw new ExpectationError();
        } catch (error) {
          expect(error.name).to.equal('NullPointerException');
        }
      });
    });

    describe('when an attribute has no name', function() {
      it('throws an exception', function() {
        var otherParser =  new mp.UMLDesignerParser(
            getRootElement(
              readFileContent('./test/xmi/umldesigner_no_attribute_name_test.uml')),
            initDatabaseTypeHolder('sql'));
        otherParser.findElements();
        try {
          otherParser.fillClassesAndFields();
          throw new ExpectationError();
        } catch (error) {
          expect(error.name).to.equal('NullPointerException');
        }
      });
    });

    describe('#addClass', function() {
      it('adds the found classes', function() {
        expect(Object.keys(parser.getClasses()).length).to.equal(9);
      });

      describe("when trying to access an element's attributes", function() {
        var firstElementKeys;

        before(function() {
          firstElementKeys = Object.keys(
            parser.getClasses()[Object.keys(parser.getClasses())[0]]);
        });

        it('has a name', function() {
          expect(firstElementKeys).to.include('name');
        });

        it('has fields', function() {
          expect(firstElementKeys).to.include('fields');
        });

        it('has injected fields', function() {
          expect(firstElementKeys).to.include('injectedFields');
        });

        it('should not throw any error if there is no attribute', function() {
          var anotherParser = new mp.UMLDesignerParser(
            getRootElement(
              readFileContent('./test/xmi/umldesigner_no_attribute_test.uml')),
            initDatabaseTypeHolder('sql'));
          try {
            anotherParser.parse();
          } catch (error) {
            throw new ExpectationError();
          }
        });
      });
    });

    describe('#isAnId', function() {
      describe(
          "when passing fields that match 'id', with non-sensitive case",
          function() {
        it('returns true', function() {
          expect(parser.isAnId('id', 'Class')).to.equal(true);
          expect(parser.isAnId('Id', 'Class')).to.equal(true);
          expect(parser.isAnId('iD', 'Class')).to.equal(true);
          expect(parser.isAnId('ID', 'Class')).to.equal(true);
        });
      });

      describe('when passing fields matching: className + Id', function() {
        it('returns true', function() {
          expect(parser.isAnId('classId', 'Class')).to.equal(true);
        });
      });
    });

    describe('#addField', function() {
      describe('#addRegularField', function() {
        it('adds the fields', function() {
          expect(Object.keys(parser.getFields()).length).to.equal(22);
        });

        it('adds the fields to the classes', function() {
          var count = 0;
          for(var element in parser.getClasses()) {
            count += parser.getClasses()[element]['fields'].length;
          }
          expect(count).to.equal(Object.keys(parser.getFields()).length);
        });

        describe("when trying to access an element's attributes", function() {
          var firstElementKeys;

          before(function() {
            firstElementKeys = Object.keys(
              parser.getFields()[
                Object.keys(parser.getFields())[0]]);
          });

          it('has a name', function() {
            expect(firstElementKeys).to.include('name');
          });

          it('has validations', function() {
            expect(firstElementKeys).to.include('validations');
          });

          it('has a type', function() {
            expect(firstElementKeys).to.include('type');
          });
        });

        describe('when having an invalid type in the XMI', function() {
          it('throws an exception', function() {
            var otherParser = new mp.UMLDesignerParser(
              getRootElement(
                readFileContent('./test/xmi/umldesigner_wrong_typename.uml')),
              initDatabaseTypeHolder('sql'));
            try {
              otherParser.parse();
              throw new ExpectationError();
            } catch (error) {
              expect(error.name).to.equal('InvalidTypeException');
            }
          });
        });

        describe(
            'when a type was not defined in a primitiveType tag',
            function() {
          it('is deduced from the field element, and added', function() {
            expect(parser.getTypes()['String']).to.equal('String');
            expect(parser.getTypes()['Integer']).to.equal('Integer');
          });
        });
      });
    });
  });

  describe('#fillAssociations', function() {
    before(function() {
      parser.fillAssociations();
    });

    it('inserts the found associations', function() {
      expect(Object.keys(parser.getAssociations()).length).to.equal(10);
    });

    describe("when trying to access an element's attributes", function() {
      var firstElementKeys;

      before(function() {
        firstElementKeys = Object.keys(
          parser.getAssociations()[Object.keys(parser.getAssociations())[0]]);
      })

      it('has a name', function() {
        expect(firstElementKeys).to.include('name');
      });

      it('has a type', function() {
        expect(firstElementKeys).to.include('type');
      });

      it('has a flag telling if it has an upper value', function() {
        expect(firstElementKeys).to.include('isUpperValuePresent');
      });
    });

    describe('#addInjectedField', function() {
      it('adds the injected fields', function() {
        expect(Object.keys(parser.getClasses()).length).to.equal(9);
      });

      describe("when trying to access an element's attributes", function() {
        var firstElementKeys;

        before(function() {
          firstElementKeys = Object.keys(
            parser.getInjectedFields()[
              Object.keys(parser.getInjectedFields())[0]]);
        });

        it('has a name', function() {
          expect(firstElementKeys).to.include('name');
        });

        it('has a type', function() {
          expect(firstElementKeys).to.include('type');
        });

        it('has a association', function() {
          expect(firstElementKeys).to.include('association');
        });

        it('has a class', function() {
          expect(firstElementKeys).to.include('class');
        });
        
        it('has a flag if the upper value is present', function() {
          expect(firstElementKeys).to.include('isUpperValuePresent');
        });

        it('has a cardinality', function() {
          expect(firstElementKeys).to.include('cardinality');
        });
      });

      describe('#getCardinality', function() {
        describe('#isOneToOne', function() {
          describe('when passing valid parameters', function() {
            it('returns true', function() {
              expect(parser.isOneToOne(false, false)).to.equal(true);
            });
          });

          describe('when passing invalid parameters', function() {
            it('returns false', function() {
              expect(parser.isOneToOne(true, true)).to.equal(false);
              expect(parser.isOneToOne(true, false)).to.equal(false);
              expect(parser.isOneToOne(false, true)).to.equal(false);
            });
          });
        });

        describe('#isOneToMany', function() {
          describe('when passing valid parameters', function() {
            it('returns true', function() {
              expect(parser.isOneToMany(true, false)).to.equal(true);

              expect(parser.isOneToMany(false, true)).to.equal(true);
            });
          });

          describe('when passing invalid parameters', function() {
            it('returns false', function() {
              expect(parser.isOneToMany(true, true)).to.equal(false);

              expect(parser.isOneToMany(false, false)).to.equal(false);
            });
          });
        });

        describe('#isManyToMany', function() {
          describe('when passing valid parameters', function() {
            it('returns true', function() {
              expect(parser.isManyToMany(true, true)).to.equal(true);
            });
          });

          describe('when passing invalid parameters', function() {
            it('returns false', function() {
              expect(parser.isManyToMany(false, false)).to.equal(false);

              expect(parser.isManyToMany(false, true)).to.equal(false);

              expect(parser.isManyToMany(true, false)).to.equal(false);
            });
          });
        });
      });
    });
  });
});


// external functions

function getRootElement(content) {
  var root;
  var parser = new xml2js.Parser(); // as an option: {explicitArray : false}
  var result = parser.parseString(content, function (err, result) {
    if (result.hasOwnProperty('uml:Model')) {
      root = result['uml:Model'];
    } else if (result.hasOwnProperty('xmi:XMI')) {
      root = result['xmi:XMI']['uml:Model'][0];
    } else {
      throw new NoRootElementException(
        'The passed document has no immediate root element,'
        + ' exiting now.');
    }
  });
  return root;
}

function readFileContent(file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    throw new WrongPassedArgumentException(
      "The passed file '"
      + file
      + "' must exist and must not be a directory, exiting now.'");
  }
  return fs.readFileSync(file, 'utf-8');
}

function initDatabaseTypeHolder(databaseTypeName) {
  switch (databaseTypeName) {
    case 'sql':
      return new types.SQLTypes();
    case 'mongodb':
      return new types.MongoDBTypes();
    case 'cassandra':
      return new types.CassandraTypes();
    default:
      throw new WrongDatabaseTypeException(
        'The passed database type is incorrect. '
        + "Must either be 'sql', 'mongodb', or 'cassandra'. Got '"
        + databaseTypeName
        + "', exiting now.");
  }
}

function ExpectationError(message) {
  this.name = 'ExpectationError';
  this.message = (message || '');
}
ExpectationError.prototype = new Error();