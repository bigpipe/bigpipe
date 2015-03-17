#
# Get the absolute location of this script so we can correctly symlink the files
# and other dependencies can also force bigpipe in to submission by manually calling
# this supplied symlink file.
#
ROOT="$( cd "$( dirname "$0" )" && pwd )"

#
# We assume that all the sub projects are in the previous folder.
#
rm -rf $ROOT/node_modules/pagelet
ln -s ../../pagelet $ROOT/node_modules

rm -rf $ROOT/node_modules/bootstrap-pagelet
ln -s ../../bootstrap-pagelet $ROOT/node_modules

rm -rf $ROOT/node_modules/404-pagelet
ln -s ../../404-pagelet $ROOT/node_modules

rm -rf $ROOT/node_modules/500-pagelet
ln -s ../../500-pagelet $ROOT/node_modules

rm -rf $ROOT/node_modules/bigpipe.js
ln -s ../../bigpipe.js $ROOT/node_modules

rm -rf $ROOT/node_modules/temper
ln -s ../../temper $ROOT/node_modules
