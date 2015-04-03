#
# Get the absolute location of this script so we can correctly symlink the files
# and other dependencies can also force bigpipe in to submission by manually calling
# this supplied symlink file.
#
ROOT="$( cd "$( dirname "$0" )" && pwd )"

#
# Tell npm to install our core dependencies through the github master branches.
#
npm install --prefix $ROOT bigpipe/pagelet bigpipe/bigpipe.js \
bigpipe/bootstrap-pagelet bigpipe/500-pagelet bigpipe/404-pagelet \
bigpipe/diagnostics-pagelet bigpipe/fittings

#
# As a lot of dependencies referrer to pagelet's we need to correct their
# dependencies so they all use the pagelet's master branch
#
rm -rf $ROOT/node_modules/bigpipe.js/node_modules/fittings
mkdir -p $ROOT/node_modules/bigpipe.js/node_modules/fittings
ln -s $ROOT/node_modules/fittings $ROOT/node_modules/bigpipe.js/node_modules/fittings

rm -rf $ROOT/node_modules/bootstrap-pagelet/node_modules/pagelet
mkdir -p $ROOT/node_modules/bootstrap-pagelet/node_modules
ln -s $ROOT/node_modules/pagelet $ROOT/node_modules/bootstrap-pagelet/node_modules/pagelet

rm -rf $ROOT/node_modules/diagnostics-pagelet/node_modules/pagelet
mkdir -p $ROOT/node_modules/diagnostics-pagelet/node_modules
ln -s $ROOT/node_modules/pagelet $ROOT/node_modules/diagnostics-pagelet/node_modules/pagelet

rm -rf $ROOT/node_modules/404-pagelet/node_modules/pagelet
rm -rf $ROOT/node_modules/404-pagelet/node_modules/diagnostics-pagelet
mkdir -p $ROOT/node_modules/404-pagelet/node_modules
ln -s $ROOT/node_modules/pagelet $ROOT/node_modules/404-pagelet/node_modules/pagelet
ln -s $ROOT/node_modules/diagnostics-pagelet $ROOT/node_modules/404-pagelet/node_modules/diagnostics-pagelet

rm -rf $ROOT/node_modules/500-pagelet/node_modules/pagelet
rm -rf $ROOT/node_modules/500-pagelet/node_modules/diagnostics-pagelet
mkdir -p $ROOT/node_modules/500-pagelet/node_modules
ln -s $ROOT/node_modules/pagelet $ROOT/node_modules/500-pagelet/node_modules/pagelet
ln -s $ROOT/node_modules/diagnostics-pagelet $ROOT/node_modules/500-pagelet/node_modules/diagnostics-pagelet
